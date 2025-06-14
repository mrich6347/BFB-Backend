import { ConflictException, Injectable } from '@nestjs/common';
import { AccountResponse, CreateAccountDto, AccountWithReadyToAssignResponse, ReconcileAccountDto, ReconcileAccountResponse } from './DTO/account.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionResponse } from '../transactions/dto/transaction.dto';

@Injectable()
export class AccountsService {
  private supabase: SupabaseClient;

  constructor(
    private supabaseService: SupabaseService,
    private readyToAssignService: ReadyToAssignService,
    private transactionsService: TransactionsService
  ) {
    this.supabase = this.supabaseService.client;
  }

  async create(createAccountDto: CreateAccountDto, userId: string, authToken: string): Promise<AccountWithReadyToAssignResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { current_balance, ...accountData } = createAccountDto;

    let payload = {
      ...accountData,
      user_id: userId,
      cleared_balance: current_balance,
      working_balance: current_balance
    }

    await this.checkForExistingAccount(userId, authToken, accountData.budget_id, accountData.name);

    const { data, error } = await supabase
      .from('accounts')
      .insert(payload)
      .select('id, name, account_type, budget_id, interest_rate, minimum_monthly_payment, cleared_balance, uncleared_balance, working_balance, is_active')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Calculate updated Ready to Assign after account creation
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      accountData.budget_id,
      userId,
      authToken
    );

    return {
      account: data,
      readyToAssign
    };
  }

  async findAll(userId: string, authToken: string, budgetId: string): Promise<AccountResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, account_type, budget_id, interest_rate, minimum_monthly_payment, cleared_balance, uncleared_balance, working_balance, is_active')
      .eq('user_id', userId)
      .eq('budget_id', budgetId);

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async findOne(id: string, userId: string, authToken: string): Promise<AccountResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, account_type, budget_id, interest_rate, minimum_monthly_payment, cleared_balance, uncleared_balance, working_balance, is_active')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async checkForExistingAccount(userId: string, authToken: string, budgetId: string, accountName: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('budget_id', budgetId)
      .ilike('name', accountName);

    if (error) {
      throw new Error(error.message);
    }

    if (data.length > 0) {
      throw new ConflictException(`An account already exists with the name '${accountName}'`);
    }
  }

  async reconcileAccount(accountId: string, reconcileDto: ReconcileAccountDto, userId: string, authToken: string): Promise<ReconcileAccountResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get the account and its current cleared balance
    const account = await this.findOne(accountId, userId, authToken);
    const currentClearedBalance = account.cleared_balance;
    const actualBalance = reconcileDto.actual_balance;
    const adjustmentAmount = actualBalance - currentClearedBalance;

    let adjustmentTransaction: TransactionResponse | null = null;

    // If there's a discrepancy, create an adjustment transaction
    if (Math.abs(adjustmentAmount) > 0.001) { // Use small epsilon for floating point comparison
      adjustmentTransaction = await this.transactionsService.create({
        account_id: accountId,
        date: new Date().toISOString().split('T')[0], // Today's date
        amount: adjustmentAmount,
        memo: `Reconciliation adjustment: ${adjustmentAmount > 0 ? 'Added' : 'Removed'} ${Math.abs(adjustmentAmount).toFixed(2)}`,
        payee: 'Reconciliation Adjustment',
        category_id: undefined, // This will be treated as "Ready to Assign"
        is_cleared: true,
        is_reconciled: true
      }, userId, authToken);
    }

    // Mark all cleared transactions as reconciled
    await this.transactionsService.markTransactionsAsReconciled(accountId, userId, authToken);

    // Update account balance to match the actual balance
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        cleared_balance: actualBalance,
        working_balance: actualBalance + account.uncleared_balance
      })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Get updated account
    const updatedAccount = await this.findOne(accountId, userId, authToken);

    // Calculate updated Ready to Assign
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      account.budget_id,
      userId,
      authToken
    );

    return {
      account: updatedAccount,
      adjustmentTransaction,
      readyToAssign
    };
  }

}
