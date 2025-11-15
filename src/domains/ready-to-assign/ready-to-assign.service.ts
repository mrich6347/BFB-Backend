import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { AccountType } from '../accounts/DTO/account.dto';

@Injectable()
export class ReadyToAssignService {
  private supabase: SupabaseClient;

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
  }

  async calculateReadyToAssign(budgetId: string, userId: string, authToken: string): Promise<number> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Calculate Total Cash from accounts
    const totalCash = await this.calculateTotalAvailableMoney(supabase, budgetId, userId);

    // Calculate category balances
    const { positiveAvailable, negativeAssigned } = await this.calculateTotalAssigned(supabase, budgetId, userId);

    // Ready to Assign = Cash - Positive Available + Negative Assigned (which frees up money)
    const readyToAssign = totalCash - positiveAvailable + Math.abs(negativeAssigned);

    console.log('📊 RTA: Cash=$' + totalCash.toFixed(2) + ' - Positive Available=$' + positiveAvailable.toFixed(2) + ' + Negative Assigned=$' + Math.abs(negativeAssigned).toFixed(2) + ' = $' + readyToAssign.toFixed(2));

    return readyToAssign;
  }

  private async calculateTotalAvailableMoney(supabase: SupabaseClient, budgetId: string, userId: string): Promise<number> {
    // Get account balances - use working_balance which includes all transactions (cleared + uncleared)
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, name, account_type, working_balance')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      throw new Error(error.message);
    }

    let totalFromAccounts = 0;
    const cashAccounts: string[] = [];

    for (const account of accounts || []) {
      const balance = account.working_balance || 0;

      // Only cash accounts contribute to Ready to Assign (tracking accounts are excluded)
      if (account.account_type === AccountType.CASH) {
        totalFromAccounts += balance;
        cashAccounts.push(`${account.name}=$${balance.toFixed(2)}`);
      }
    }

    console.log(`   💵 Cash accounts: [${cashAccounts.join(', ')}] = $${totalFromAccounts.toFixed(2)}`);

    return totalFromAccounts;
  }

  private async calculateTotalAssigned(supabase: SupabaseClient, budgetId: string, userId: string): Promise<{ positiveAvailable: number; negativeAssigned: number }> {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;
    let targetYear = currentYear;
    let targetMonth = currentMonth;

    let { data: categoryBalances, error } = await supabase
      .from('category_balances')
      .select('assigned, available, category_id, year, month')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .eq('year', currentYear)
      .eq('month', currentMonth);

    if (error) {
      throw new Error(error.message);
    }

    if (!categoryBalances || categoryBalances.length === 0) {
      const { data: latestMonth } = await supabase
        .from('category_balances')
        .select('year, month')
        .eq('budget_id', budgetId)
        .eq('user_id', userId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(1);

      if (latestMonth && latestMonth.length > 0) {
        const { year: fallbackYear, month: fallbackMonth } = latestMonth[0];
        targetYear = fallbackYear;
        targetMonth = fallbackMonth;
        const fallbackResult = await supabase
          .from('category_balances')
          .select('assigned, available, category_id, year, month')
          .eq('budget_id', budgetId)
          .eq('user_id', userId)
          .eq('year', fallbackYear)
          .eq('month', fallbackMonth);

        categoryBalances = fallbackResult.data || [];
      } else {
        categoryBalances = [];
      }
    }

    // Get category names for logging
    const categoryIds = [...new Set(categoryBalances.map(b => b.category_id))];
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .in('id', categoryIds)
      .eq('user_id', userId);

    const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || []);

    // YNAB Rule:
    // - Sum positive available (money sitting in categories)
    // - Sum negative assigned (money pulled back from categories)
    let positiveAvailable = 0;
    let negativeAssigned = 0;
    const positiveCategories: string[] = [];
    const negativeCategories: string[] = [];

    for (const balance of categoryBalances) {
      const available = balance.available || 0;
      const assigned = balance.assigned || 0;
      const categoryName = categoryMap.get(balance.category_id) || 'Unknown';

      // Sum positive available
      if (available > 0) {
        positiveAvailable += available;
        positiveCategories.push(`${categoryName} available=$${available.toFixed(2)}`);
      }

      // Sum negative assigned
      if (assigned < 0) {
        negativeAssigned += assigned; // This will be negative
        negativeCategories.push(`${categoryName} assigned=$${assigned.toFixed(2)}`);
      }
    }

    console.log(`   📝 Categories (${targetYear}/${targetMonth}):`);
    if (positiveCategories.length > 0) {
      console.log(`      ✅ Positive Available [${positiveCategories.join(', ')}] = $${positiveAvailable.toFixed(2)}`);
    }
    if (negativeCategories.length > 0) {
      console.log(`      ⬅️  Negative Assigned [${negativeCategories.join(', ')}] = $${negativeAssigned.toFixed(2)}`);
    }

    return { positiveAvailable, negativeAssigned };
  }


}
