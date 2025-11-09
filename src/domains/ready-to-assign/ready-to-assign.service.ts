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

    // Calculate Total Available Money from accounts
    const totalAvailableMoney = await this.calculateTotalAvailableMoney(supabase, budgetId, userId);

    // Calculate Total Available money sitting in category balances across all months
    // Negative availability represents overspending that still needs to be covered
    const totalCategoryAvailability = await this.calculateTotalCategoryAvailability(supabase, budgetId, userId);

    const readyToAssign = totalAvailableMoney - totalCategoryAvailability;

    console.log('📊 RTA: Cash=$' + totalAvailableMoney.toFixed(2) + ' - Categories=$' + totalCategoryAvailability.toFixed(2) + ' = $' + readyToAssign.toFixed(2));

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

  private async calculateTotalCategoryAvailability(supabase: SupabaseClient, budgetId: string, userId: string): Promise<number> {
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

    // Sum all available amounts - YNAB only counts positive availability
    // Negative availability (overspending) is already reflected in reduced account balances
    // So we don't double-count it by also reducing Ready to Assign
    let totalPositiveAvailability = 0;
    let totalNegativeAvailability = 0;
    const positiveCategories: string[] = [];
    const negativeCategories: string[] = [];

    for (const balance of categoryBalances) {
      const available = balance.available || 0;
      const categoryName = categoryMap.get(balance.category_id) || 'Unknown';

      if (available > 0) {
        totalPositiveAvailability += available;
        positiveCategories.push(`${categoryName}=$${available.toFixed(2)}`);
      } else if (available < 0) {
        totalNegativeAvailability += available;
        negativeCategories.push(`${categoryName}=$${available.toFixed(2)}`);
      }
    }

    const totalCategoryAvailability = totalPositiveAvailability + totalNegativeAvailability;

    console.log(`   📝 Categories (${targetYear}/${targetMonth}):`);
    if (positiveCategories.length > 0) {
      console.log(`      ✅ Positive [${positiveCategories.join(', ')}] = $${totalPositiveAvailability.toFixed(2)}`);
    }
    if (negativeCategories.length > 0) {
      console.log(`      ❌ Negative [${negativeCategories.join(', ')}] = $${totalNegativeAvailability.toFixed(2)}`);
    }
    console.log(`      📊 Total = $${totalPositiveAvailability.toFixed(2)} + $${totalNegativeAvailability.toFixed(2)} = $${totalCategoryAvailability.toFixed(2)}`);

    return totalCategoryAvailability;
  }


}
