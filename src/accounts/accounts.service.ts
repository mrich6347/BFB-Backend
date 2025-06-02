import { ConflictException, Injectable } from '@nestjs/common';
import { AccountResponse, CreateAccountDto, AccountWithReadyToAssignResponse } from './DTO/account.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';

@Injectable()
export class AccountsService {
  private supabase: SupabaseClient;

  constructor(
    private supabaseService: SupabaseService,
    private readyToAssignService: ReadyToAssignService
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

}
