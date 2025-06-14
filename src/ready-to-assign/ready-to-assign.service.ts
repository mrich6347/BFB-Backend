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
    // This includes negative assigned amounts (money moved back to Ready to Assign)
    const totalAssignedMoney = await this.calculateTotalAssignedMoney(supabase, budgetId, userId);

    return totalAvailableMoney - totalAssignedMoney;
  }

  private async calculateTotalAvailableMoney(supabase: SupabaseClient, budgetId: string, userId: string): Promise<number> {
    // Get account starting balances (not working balances which include spending)
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, account_type, account_balance')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      throw new Error(error.message);
    }

    let totalFromAccounts = 0;
    const accountIds: string[] = [];

    for (const account of accounts || []) {
      const balance = account.account_balance || 0;

      // Only cash accounts are supported now
      if (account.account_type === AccountType.CASH) {
        totalFromAccounts += balance;
        accountIds.push(account.id);
      }
    }

    // Add income transactions (transactions with null category_id represent Ready to Assign income)
    if (accountIds.length > 0) {
      const { data: incomeTransactions, error: incomeError } = await supabase
        .from('transactions')
        .select('amount')
        .is('category_id', null) // Ready to Assign transactions have null category_id
        .in('account_id', accountIds)
        .eq('user_id', userId);

      if (incomeError) {
        throw new Error(incomeError.message);
      }

      let totalIncome = 0;
      for (const transaction of incomeTransactions || []) {
        totalIncome += transaction.amount || 0;
      }

      return totalFromAccounts + totalIncome;
    }

    return totalFromAccounts;
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

    // Sum all assigned amounts across all months (including negative ones)
    // Negative assigned amounts represent money moved back to Ready to Assign
    let totalAssigned = 0;
    for (const balance of categoryBalances) {
      const assigned = balance.assigned || 0;
      totalAssigned += assigned;
    }

    return totalAssigned;
  }


}
