import { ConflictException, Injectable } from '@nestjs/common';
import { AccountResponse, CreateAccountDto, AccountWithReadyToAssignResponse, ReconcileAccountDto, ReconcileAccountResponse, UpdateAccountDto, CloseAccountResponse, ReorderAccountsDto, MakeCreditCardPaymentDto, MakeCreditCardPaymentResponse } from './DTO/account.dto';
import { SupabaseService } from '../../supabase/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionResponse } from '../transactions/dto/transaction.dto';
import { CategoryWriteService } from '../categories/services/write/category-write.service';
import { CategoryResponse } from '../categories/dto/category.dto';

@Injectable()
export class AccountsService {
  private supabase: SupabaseClient;

  constructor(
    private supabaseService: SupabaseService,
    private readyToAssignService: ReadyToAssignService,
    private transactionsService: TransactionsService,
    private categoryWriteService: CategoryWriteService
  ) {
    this.supabase = this.supabaseService.client;
  }

  async create(createAccountDto: CreateAccountDto, userId: string, authToken: string): Promise<AccountWithReadyToAssignResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { account_balance, ...accountData } = createAccountDto;

    // Get the next display_order for this account type
    const { data: existingAccounts, error: countError } = await supabase
      .from('accounts')
      .select('display_order')
      .eq('user_id', userId)
      .eq('budget_id', accountData.budget_id)
      .eq('account_type', accountData.account_type)
      .order('display_order', { ascending: false })
      .limit(1);

    if (countError) {
      throw new Error(countError.message);
    }

    const nextDisplayOrder = existingAccounts && existingAccounts.length > 0
      ? existingAccounts[0].display_order + 1
      : 0;

    let payload = {
      ...accountData,
      user_id: userId,
      account_balance: account_balance || 0,
      cleared_balance: account_balance || 0,
      uncleared_balance: 0,
      working_balance: account_balance || 0,
      display_order: nextDisplayOrder
    }

    await this.checkForExistingAccount(userId, authToken, accountData.budget_id, accountData.name);

    const { data, error } = await supabase
      .from('accounts')
      .insert(payload)
      .select('id, name, account_type, budget_id, account_balance, cleared_balance, uncleared_balance, working_balance, is_active, display_order')
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
      .select('id, name, account_type, budget_id, account_balance, cleared_balance, uncleared_balance, working_balance, is_active, display_order')
      .eq('user_id', userId)
      .eq('budget_id', budgetId)
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async findOne(id: string, userId: string, authToken: string): Promise<AccountResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, account_type, budget_id, account_balance, cleared_balance, uncleared_balance, working_balance, is_active, display_order')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async checkForExistingAccount(userId: string, authToken: string, budgetId: string, accountName: string, excludeAccountId?: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    let query = supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('budget_id', budgetId)
      .ilike('name', accountName);

    // Exclude the current account when updating
    if (excludeAccountId) {
      query = query.neq('id', excludeAccountId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (data.length > 0) {
      throw new ConflictException(`An account already exists with the name '${accountName}'`);
    }
  }

  async update(accountId: string, updateAccountDto: UpdateAccountDto, userId: string, authToken: string): Promise<AccountWithReadyToAssignResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get the current account to validate budget_id and get current data
    const currentAccount = await this.findOne(accountId, userId, authToken);

    // If updating name, check for duplicates
    if (updateAccountDto.name) {
      await this.checkForExistingAccount(userId, authToken, currentAccount.budget_id, updateAccountDto.name, accountId);
    }

    const { data, error } = await supabase
      .from('accounts')
      .update(updateAccountDto)
      .eq('id', accountId)
      .eq('user_id', userId)
      .select('id, name, account_type, budget_id, account_balance, cleared_balance, uncleared_balance, working_balance, is_active, display_order')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Calculate updated Ready to Assign
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      data.budget_id,
      userId,
      authToken
    );

    return {
      account: data,
      readyToAssign
    };
  }

  async close(accountId: string, userId: string, authToken: string): Promise<CloseAccountResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get the account and its current working balance
    const account = await this.findOne(accountId, userId, authToken);
    const currentBalance = account.working_balance;

    let adjustmentTransaction: TransactionResponse | null = null;

    // If there's a balance, create an adjustment transaction to zero it out
    if (Math.abs(currentBalance) > 0.001) { // Use small epsilon for floating point comparison
      const adjustmentAmount = -currentBalance; // Opposite of current balance to zero it out

      const transactionResult = await this.transactionsService.create({
        account_id: accountId,
        date: new Date().toISOString().split('T')[0], // Today's date
        amount: adjustmentAmount,
        memo: `Account closure adjustment: ${adjustmentAmount > 0 ? 'Added' : 'Removed'} ${Math.abs(adjustmentAmount).toFixed(2)}`,
        payee: 'Account Closure Adjustment',
        category_id: undefined, // This will be treated as "Ready to Assign"
        is_cleared: true,
        is_reconciled: false
      }, userId, authToken);

      // Extract transaction from result (could be TransactionResponse or TransactionWithAccountsResponse)
      adjustmentTransaction = 'transaction' in transactionResult ? transactionResult.transaction : transactionResult;
    }

    // Set account as inactive and zero out balances
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        is_active: false,
        account_balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
        working_balance: 0
      })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // If this was a credit card account, move the payment category to Hidden Categories
    if (account.account_type === 'CREDIT') {
      await this.movePaymentCategoryToHidden(account.name, account.budget_id, userId, authToken);
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

  async reopen(accountId: string, userId: string, authToken: string): Promise<AccountWithReadyToAssignResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get the account to validate it exists and is closed
    const account = await this.findOne(accountId, userId, authToken);

    if (account.is_active) {
      throw new Error('Account is already active');
    }

    // Reactivate the account
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        is_active: true
      })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Get updated account
    const updatedAccount = await this.findOne(accountId, userId, authToken);

    // If this was a credit card account, move the payment category back from Hidden Categories
    let reactivatedCategory: CategoryResponse | undefined;
    if (account.account_type === 'CREDIT') {
      const categoryResult = await this.movePaymentCategoryFromHidden(account.name, account.budget_id, userId, authToken);
      if (categoryResult) {
        reactivatedCategory = categoryResult.category;
      }
    }

    // Calculate updated Ready to Assign
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      account.budget_id,
      userId,
      authToken
    );

    const response: AccountWithReadyToAssignResponse = {
      account: updatedAccount,
      readyToAssign
    };

    // Include category in response if it was reactivated
    if (reactivatedCategory) {
      response.category = reactivatedCategory;
    }

    return response;
  }

  async updateTrackingBalance(accountId: string, newBalance: number, memo: string, userId: string, authToken: string): Promise<ReconcileAccountResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get the account and verify it's a tracking account
    const account = await this.findOne(accountId, userId, authToken);
    if (account.account_type !== 'TRACKING') {
      throw new Error('Balance updates are only allowed for tracking accounts');
    }

    const currentBalance = account.working_balance;
    const adjustmentAmount = newBalance - currentBalance;

    let adjustmentTransaction: TransactionResponse | null = null;

    // If there's a balance change, create an adjustment transaction
    if (Math.abs(adjustmentAmount) > 0.001) { // Use small epsilon for floating point comparison
      const transactionResult = await this.transactionsService.create({
        account_id: accountId,
        date: new Date().toISOString().split('T')[0], // Today's date
        amount: adjustmentAmount,
        memo: memo || 'Balance update',
        payee: 'Balance Update',
        category_id: undefined, // This will be treated as "Ready to Assign" but won't affect it for tracking accounts
        is_cleared: true,
        is_reconciled: false
      }, userId, authToken);

      // Extract transaction from result (could be TransactionResponse or TransactionWithAccountsResponse)
      adjustmentTransaction = 'transaction' in transactionResult ? transactionResult.transaction : transactionResult;
    }

    // Update account balance to the new balance
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        account_balance: newBalance,
        cleared_balance: newBalance,
        working_balance: newBalance
      })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Get updated account
    const updatedAccount = await this.findOne(accountId, userId, authToken);

    // Calculate Ready to Assign (should be unchanged since tracking accounts don't affect it)
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

  async getBalanceHistory(accountId: string, userId: string, authToken: string): Promise<any[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get the account and verify it's a tracking account
    const account = await this.findOne(accountId, userId, authToken);
    if (account.account_type !== 'TRACKING') {
      throw new Error('Balance history is only available for tracking accounts');
    }

    // Get all transactions for this account, ordered by date
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, date, amount, memo, payee')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    // For tracking accounts, we need to reconstruct the balance at each point
    // by working backwards from the current balance
    const balanceHistory: any[] = [];

    if (!transactions || transactions.length === 0) {
      // No transactions, just show current balance
      balanceHistory.push({
        date: new Date().toISOString().split('T')[0],
        balance: account.working_balance,
        memo: 'Starting balance',
        transaction_id: null
      });
    } else {
      // Work backwards from current balance to reconstruct history
      let currentBalance = account.working_balance;

      // Add current balance as the most recent point
      const lastTransaction = transactions[transactions.length - 1];
      balanceHistory.push({
        date: lastTransaction.date,
        balance: currentBalance,
        memo: lastTransaction.memo || lastTransaction.payee || 'Balance update',
        transaction_id: lastTransaction.id
      });

      // Work backwards through transactions to reconstruct previous balances
      for (let i = transactions.length - 2; i >= 0; i--) {
        const transaction = transactions[i + 1]; // The transaction that brought us to currentBalance
        currentBalance -= transaction.amount || 0; // Subtract to get previous balance

        balanceHistory.push({
          date: transactions[i].date,
          balance: currentBalance,
          memo: transactions[i].memo || transactions[i].payee || 'Balance update',
          transaction_id: transactions[i].id
        });
      }

      // Add starting balance (before first transaction)
      const firstTransaction = transactions[0];
      currentBalance -= firstTransaction.amount || 0;
      balanceHistory.push({
        date: firstTransaction.date,
        balance: currentBalance,
        memo: 'Starting balance',
        transaction_id: null
      });
    }

    // Return newest first (already in reverse chronological order)
    return balanceHistory;
  }

  async getTransferOptions(accountId: string, userId: string, authToken: string): Promise<AccountResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get the source account to determine its type and budget
    const sourceAccount = await this.findOne(accountId, userId, authToken);

    // Determine which account types to include based on source account type
    // If source is CASH, include CASH, TRACKING, and CREDIT accounts
    // Otherwise, include TRACKING and CREDIT accounts (existing behavior)
    const accountTypes = sourceAccount.account_type === 'CASH'
      ? ['CASH', 'TRACKING']
      : ['TRACKING'];

    // Get eligible accounts in the same budget
    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, account_type, budget_id, account_balance, cleared_balance, uncleared_balance, working_balance, is_active, display_order')
      .eq('user_id', userId)
      .eq('budget_id', sourceAccount.budget_id)
      .in('account_type', accountTypes)
      .neq('id', accountId) // Exclude the source account to prevent self-transfers
      .eq('is_active', true)
      .order('name');

    if (error) {
      throw new Error(error.message);
    }

    return data;
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
      const transactionResult = await this.transactionsService.create({
        account_id: accountId,
        date: new Date().toISOString().split('T')[0], // Today's date
        amount: adjustmentAmount,
        memo: `Reconciliation adjustment: ${adjustmentAmount > 0 ? 'Added' : 'Removed'} ${Math.abs(adjustmentAmount).toFixed(2)}`,
        payee: 'Reconciliation Adjustment',
        category_id: undefined, // This will be treated as "Ready to Assign"
        is_cleared: true,
        is_reconciled: true
      }, userId, authToken);

      // Extract transaction from result (could be TransactionResponse or TransactionWithAccountsResponse)
      adjustmentTransaction = 'transaction' in transactionResult ? transactionResult.transaction : transactionResult;
    }

    // Mark all cleared transactions as reconciled
    await this.transactionsService.markTransactionsAsReconciled(accountId, userId, authToken);

    // Update account balance to match the actual balance
    // When reconciling, we set the account_balance to the actual balance
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        account_balance: actualBalance,
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

  async reorder(reorderDto: ReorderAccountsDto, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Update display_order for each account
    for (let i = 0; i < reorderDto.account_ids.length; i++) {
      const { error } = await supabase
        .from('accounts')
        .update({ display_order: i })
        .eq('id', reorderDto.account_ids[i])
        .eq('user_id', userId);

      if (error) {
        throw new Error(error.message);
      }
    }
  }

  /**
   * Move the payment category for a credit card account to Hidden Categories
   */
  private async movePaymentCategoryToHidden(accountName: string, budgetId: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Find the payment category for this credit card account
    const paymentCategoryName = `${accountName} Payment`;

    const { data: paymentCategory, error: findError } = await supabase
      .from('categories')
      .select('id')
      .eq('name', paymentCategoryName)
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .single();

    if (findError || !paymentCategory) {
      // Payment category not found - this is okay, maybe it was already deleted or never existed
      console.log(`Payment category '${paymentCategoryName}' not found for account '${accountName}'`);
      return;
    }

    try {
      // Use the categories service to hide the payment category
      await this.categoryWriteService.hide(paymentCategory.id, userId, authToken);
      console.log(`Moved payment category '${paymentCategoryName}' to Hidden Categories`);
    } catch (error) {
      console.error(`Failed to move payment category '${paymentCategoryName}' to Hidden Categories:`, error);
      // Don't throw - account closure should still succeed even if category move fails
    }
  }

  /**
   * Move the payment category for a credit card account from Hidden Categories back to Credit Card Payments
   */
  private async movePaymentCategoryFromHidden(accountName: string, budgetId: string, userId: string, authToken: string): Promise<{ category: CategoryResponse } | null> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Find the payment category for this credit card account
    const paymentCategoryName = `${accountName} Payment`;

    const { data: paymentCategory, error: findError } = await supabase
      .from('categories')
      .select('id')
      .eq('name', paymentCategoryName)
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .single();

    if (findError || !paymentCategory) {
      // Payment category not found - this is okay, maybe it was already deleted or never existed
      console.log(`Payment category '${paymentCategoryName}' not found for account '${accountName}'`);
      return null;
    }

    // Find the Credit Card Payments group
    const { data: creditCardPaymentsGroup, error: groupError } = await supabase
      .from('category_groups')
      .select('id')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .eq('name', 'Credit Card Payments')
      .eq('is_system_group', true)
      .single();

    if (groupError || !creditCardPaymentsGroup) {
      console.error(`Credit Card Payments group not found for budget '${budgetId}'`);
      return null;
    }

    try {
      // Use the categories service to unhide the payment category and move it to Credit Card Payments
      const result = await this.categoryWriteService.unhide(paymentCategory.id, userId, authToken, creditCardPaymentsGroup.id);
      console.log(`Moved payment category '${paymentCategoryName}' from Hidden Categories to Credit Card Payments`);
      return { category: result.category };
    } catch (error) {
      console.error(`Failed to move payment category '${paymentCategoryName}' from Hidden Categories:`, error);
      // Don't throw - account reopen should still succeed even if category move fails
      return null;
    }
  }

  /**
   * Make a payment on a credit card account
   * This creates a transaction that:
   * 1. Adds money (inflow) to the credit card account (reduces the balance owed)
   * 2. Deducts money from the corresponding payment category
   */
  async makeCreditCardPayment(
    accountId: string,
    paymentDto: MakeCreditCardPaymentDto,
    userId: string,
    authToken: string
  ): Promise<MakeCreditCardPaymentResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get the credit card account
    const account = await this.findOne(accountId, userId, authToken);

    // Verify this is a credit card account
    if (account.account_type !== 'CREDIT') {
      throw new Error('This operation is only valid for credit card accounts');
    }

    // Find the payment category for this credit card
    const paymentCategoryName = `${account.name} Payment`;
    const { data: paymentCategory, error: paymentCategoryError } = await supabase
      .from('categories')
      .select('id, budget_id')
      .eq('name', paymentCategoryName)
      .eq('budget_id', account.budget_id)
      .eq('user_id', userId)
      .single();

    if (paymentCategoryError || !paymentCategory) {
      throw new Error(`Payment category '${paymentCategoryName}' not found for this credit card`);
    }

    // Validate the from_account is a cash account
    const fromAccount = await this.findOne(paymentDto.from_account_id, userId, authToken);
    if (fromAccount.account_type !== 'CASH') {
      throw new Error('Payment can only be made from a cash account');
    }

    // Create the payment as a transfer transaction
    // This creates two transactions:
    // 1. Outflow from cash account (negative amount)
    // 2. Inflow to credit card account (positive amount)
    // The payee format "Transfer : AccountName" indicates it's a transfer
    const transactionResult = await this.transactionsService.create({
      account_id: paymentDto.from_account_id, // Source account (cash)
      date: new Date().toISOString().split('T')[0], // Today's date
      amount: -Math.abs(paymentDto.amount), // Negative amount (outflow from cash account)
      memo: paymentDto.memo || 'Credit Card Payment',
      payee: `Transfer : ${account.name}`, // Transfer payee format
      category_id: paymentCategory.id, // Assign to payment category
      is_cleared: true,
      is_reconciled: false
    }, userId, authToken);

    // Manually update the payment category balance
    // We only update AVAILABLE - subtract the payment amount
    // (Activity and Assigned are not touched for payment category operations)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Get current payment category balance
    const { data: currentBalance, error: balanceError } = await supabase
      .from('category_balances')
      .select('*')
      .eq('category_id', paymentCategory.id)
      .eq('user_id', userId)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .single();

    if (balanceError && balanceError.code !== 'PGRST116') {
      console.error('Error fetching payment category balance:', balanceError);
    }

    // Update the payment category balance - subtract from available only
    const paymentAmount = Math.abs(paymentDto.amount);
    const newAvailable = (currentBalance?.available || 0) - paymentAmount;

    let paymentCategoryBalance: any = null;
    if (currentBalance) {
      // Update existing balance - only update available
      const { data: updatedBalance, error: updateError } = await supabase
        .from('category_balances')
        .update({
          available: newAvailable
        })
        .eq('category_id', paymentCategory.id)
        .eq('user_id', userId)
        .eq('year', currentYear)
        .eq('month', currentMonth)
        .select('*')
        .single();

      if (updateError) {
        console.error('Error updating payment category balance:', updateError);
      }
      paymentCategoryBalance = updatedBalance;
    } else {
      // Create new balance with only available set
      const { data: newBalance, error: createError } = await supabase
        .from('category_balances')
        .insert({
          category_id: paymentCategory.id,
          budget_id: paymentCategory.budget_id,
          user_id: userId,
          year: currentYear,
          month: currentMonth,
          assigned: 0,
          activity: 0,
          available: -paymentAmount
        })
        .select('*')
        .single();

      if (createError) {
        console.error('Error creating payment category balance:', createError);
      }
      paymentCategoryBalance = newBalance;
    }

    // Get updated accounts (both source cash account and target credit card account)
    const updatedCreditCardAccount = await this.findOne(accountId, userId, authToken);
    const updatedCashAccount = await this.findOne(paymentDto.from_account_id, userId, authToken);

    // Calculate updated Ready to Assign
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      account.budget_id,
      userId,
      authToken
    );

    return {
      transaction: transactionResult.transaction,
      account: updatedCreditCardAccount,
      sourceAccount: updatedCashAccount, // The cash account money came from
      paymentCategoryBalance: paymentCategoryBalance || null,
      readyToAssign
    };
  }

}
