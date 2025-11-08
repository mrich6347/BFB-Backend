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

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 READY TO ASSIGN CALCULATION');
    console.log('═══════════════════════════════════════════════════════════');

    // Calculate Total Available Money from accounts
    const totalAvailableMoney = await this.calculateTotalAvailableMoney(supabase, budgetId, userId);

    // Calculate Total Available money sitting in category balances across all months
    // Negative availability represents overspending that still needs to be covered
    const totalCategoryAvailability = await this.calculateTotalCategoryAvailability(supabase, budgetId, userId);

    const readyToAssign = totalAvailableMoney - totalCategoryAvailability;

    console.log('───────────────────────────────────────────────────────────');
    console.log(`💰 Total Available Money:     $${totalAvailableMoney.toFixed(2)}`);
    console.log(`📝 Total In Categories:        $${totalCategoryAvailability.toFixed(2)}`);
    console.log(`───────────────────────────────────────────────────────────`);
    console.log(`✅ Ready to Assign:            $${readyToAssign.toFixed(2)}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    return readyToAssign;
  }

  private async calculateTotalAvailableMoney(supabase: SupabaseClient, budgetId: string, userId: string): Promise<number> {
    // Get account balances - use working_balance which includes all transactions (cleared + uncleared)
    // This matches YNAB's model where Ready to Assign = Sum of cash account current balances
    // BUT: In YNAB, reconciled transactions are excluded from Ready to Assign because they're "locked in"
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, name, account_type, account_balance, cleared_balance, uncleared_balance, working_balance')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      throw new Error(error.message);
    }

    console.log('📁 ACCOUNTS:');
    let totalFromAccounts = 0;
    const accountIds: string[] = [];

    for (const account of accounts || []) {
      // Use working_balance (current balance including all transactions) not account_balance (starting balance only)
      let balance = account.working_balance || 0;
      const accountType = account.account_type;

      // Only cash accounts contribute to Ready to Assign (tracking accounts are excluded)
      if (account.account_type === AccountType.CASH) {
        totalFromAccounts += balance;
        accountIds.push(account.id);
        console.log(`   💵 ${account.name} (${accountType}): $${balance.toFixed(2)} [working_balance]`);
        console.log(`      📊 account_balance: ${(account.account_balance || 0).toFixed(2)}`);
        console.log(`      📊 cleared_balance: ${(account.cleared_balance || 0).toFixed(2)}, uncleared_balance: ${(account.uncleared_balance || 0).toFixed(2)}`);
        console.log(`      📊 working_balance: ${(account.working_balance || 0).toFixed(2)} (before adjustment)`);
        
        // Verify the calculation
        const calculatedWorking = (account.cleared_balance || 0) + (account.uncleared_balance || 0);
        if (Math.abs(calculatedWorking - (account.working_balance || 0)) > 0.01) {
          console.log(`      ⚠️  WARNING: working_balance mismatch! Calculated: ${calculatedWorking.toFixed(2)}, Stored: ${(account.working_balance || 0).toFixed(2)}`);
        }
      } else {
        console.log(`   ⚠️  ${account.name} (${accountType}): $${balance.toFixed(2)} [EXCLUDED]`);
      }
    }

    console.log(`   ───────────────────────────────────────────────────────`);
    console.log(`   ✅ TOTAL AVAILABLE MONEY: $${totalFromAccounts.toFixed(2)}`);
    console.log(`   Note: working_balance already includes all transactions (cleared + uncleared)`);

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

    // Get category names for better logging
    const categoryIds = [...new Set(categoryBalances.map(b => b.category_id))];
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .in('id', categoryIds)
      .eq('user_id', userId);

    const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || []);

    console.log(`\n📝 CATEGORY BALANCES (for ${targetYear}/${targetMonth}):`);
    
    // Sum all assigned amounts across all months (including negative ones)
    // Negative assigned amounts represent money moved back to Ready to Assign
    let totalPositiveAvailability = 0;
    let totalOverspent = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    let zeroCount = 0;

    for (const balance of categoryBalances) {
      const available = balance.available || 0;
      if (available > 0) {
        positiveCount++;
        totalPositiveAvailability += available;
      } else if (available < 0) {
        negativeCount++;
        totalOverspent += Math.abs(available);
      } else {
        zeroCount++;
      }
      // Only log non-zero availability to avoid too much noise
      if (available !== 0) {
        const categoryName = categoryMap.get(balance.category_id) || 'Unknown';
        console.log(`   ${available >= 0 ? '+' : ''}$${available.toFixed(2)} available - ${categoryName} (${balance.year}/${balance.month}) (assigned: ${(balance.assigned || 0).toFixed(2)})`);
      }
    }

    console.log(`   ───────────────────────────────────────────────────────`);
    console.log(`   Positive availability: ${positiveCount} (total $${totalPositiveAvailability.toFixed(2)})`);
    console.log(`   Negative availability: ${negativeCount} (overspent $${totalOverspent.toFixed(2)})`);
    console.log(`   Zero availability: ${zeroCount}`);
    console.log(`   ───────────────────────────────────────────────────────`);
    console.log(`   ✅ TOTAL AVAILABLE IN CATEGORIES: $${totalPositiveAvailability.toFixed(2)}`);
    if (totalOverspent > 0) {
      console.log(`   ❗️ Overspending detected: $${totalOverspent.toFixed(2)} (already reflected in account balances)`);
    }

    return totalPositiveAvailability;
  }


}
