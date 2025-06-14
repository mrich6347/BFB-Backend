import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { AccountType } from '../accounts/entities/account.entity';

@Injectable()
export class ReadyToAssignService {
  private supabase: SupabaseClient;

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
  }

  async calculateReadyToAssign(budgetId: string, userId: string, authToken: string): Promise<number> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Calculate Total Available Money from accounts
    const totalAvailableMoney = await this.calculateTotalAvailableMoney(supabase, budgetId, userId);
    
    // Calculate Total Assigned Money from all category balances across all months
    const totalAssignedMoney = await this.calculateTotalAssignedMoney(supabase, budgetId, userId);

    return totalAvailableMoney - totalAssignedMoney;
  }

  private async calculateTotalAvailableMoney(supabase: SupabaseClient, budgetId: string, userId: string): Promise<number> {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('account_type, working_balance')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      throw new Error(error.message);
    }

    let totalAvailable = 0;

    for (const account of accounts) {
      const balance = account.working_balance || 0;

      // Only cash accounts are supported now
      if (account.account_type === AccountType.CASH) {
        totalAvailable += balance;
      }
    }

    return totalAvailable;
  }

  private async calculateTotalAssignedMoney(supabase: SupabaseClient, budgetId: string, userId: string): Promise<number> {
    const { data: categoryBalances, error } = await supabase
      .from('category_balances')
      .select('assigned')
      .eq('budget_id', budgetId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    // Sum all positive assigned amounts across all months
    let totalAssigned = 0;
    for (const balance of categoryBalances) {
      const assigned = balance.assigned || 0;
      if (assigned > 0) {
        totalAssigned += assigned;
      }
    }

    return totalAssigned;
  }
}
