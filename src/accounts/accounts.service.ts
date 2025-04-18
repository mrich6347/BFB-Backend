import { Injectable } from '@nestjs/common';
import { AccountResponse, CreateAccountDto } from './DTO/account.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AccountsService {
  private supabase: SupabaseClient;

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
  }

  async create(createAccountDto: CreateAccountDto, userId: string, authToken: string): Promise<AccountResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { current_balance, ...accountData } = createAccountDto;
    
    let payload = {
      ...accountData,
      user_id: userId,
      cleared_balance: current_balance,
      working_balance: current_balance
    }
    
    const { data, error } = await supabase
      .from('accounts')
      .insert(payload)
      .select('id, name, account_type, budget_id, interest_rate, minimum_monthly_payment, cleared_balance, uncleared_balance, working_balance, is_active')
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
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
}
