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

    // Calculate Total Assigned Money from all category balances across all months
    // This includes negative assigned amounts (money moved back to Ready to Assign)
    const totalAssignedMoney = await this.calculateTotalAssignedMoney(supabase, budgetId, userId);

    const readyToAssign = totalAvailableMoney - totalAssignedMoney;

    console.log('───────────────────────────────────────────────────────────');
    console.log(`💰 Total Available Money:     $${totalAvailableMoney.toFixed(2)}`);
    console.log(`📝 Total Assigned Money:       $${totalAssignedMoney.toFixed(2)}`);
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
        // Exclude reconciled transactions from Ready to Assign calculation
        // In YNAB, reconciled transactions are excluded because they're "locked in" to the reconciled balance
        // Since working_balance already includes reconciled transactions, we need to subtract their effect
        // For a negative transaction (-11.69), subtracting it means adding 11.69 back
        const { data: reconciledTransactions, error: reconciledError } = await supabase
          .from('transactions')
          .select('amount')
          .eq('account_id', account.id)
          .eq('is_reconciled', true)
          .eq('user_id', userId);

        if (reconciledError) {
          console.error(`Error fetching reconciled transactions for ${account.name}:`, reconciledError);
        } else {
          const reconciledTotal = reconciledTransactions?.reduce((sum, t) => sum + (parseFloat(t.amount.toString()) || 0), 0) || 0;
          if (Math.abs(reconciledTotal) > 0.01) {
            // Subtract the reconciled transactions to exclude their effect
            // For negative transactions, this effectively adds them back (canceling their effect)
            balance = balance - reconciledTotal;
            console.log(`      ⚠️  Adjusted for reconciled transactions (${reconciledTransactions?.length || 0} transactions, total: ${reconciledTotal.toFixed(2)}): ${balance.toFixed(2)}`);
          }
        }

        totalFromAccounts += balance;
        accountIds.push(account.id);
        console.log(`   💵 ${account.name} (${accountType}): $${balance.toFixed(2)} [working_balance - reconciled transactions]`);
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
    console.log(`   Subtotal from accounts: $${totalFromAccounts.toFixed(2)}`);

    // Add income transactions (transactions with null category_id represent Ready to Assign income)
    // Exclude transfers (they have transfer_id) and system-generated adjustment transactions
    // Note: Since we're using working_balance, transfers are already included in account balances
    // and shouldn't be counted again here
    let totalIncome = 0;
    if (accountIds.length > 0) {
      const { data: incomeTransactions, error: incomeError } = await supabase
        .from('transactions')
        .select('id, amount, date, payee, memo, transfer_id')
        .is('category_id', null) // Ready to Assign transactions have null category_id
        .is('transfer_id', null) // Exclude transfers - they're already in working_balance
        .in('account_id', accountIds)
        .eq('user_id', userId);

      if (incomeError) {
        throw new Error(incomeError.message);
      }

      // Filter out system-generated adjustment transactions
      const systemAdjustmentPayees = [
        'Reconciliation Adjustment',
        'Account Closure Adjustment',
        'Balance Update'
      ];

      if (incomeTransactions && incomeTransactions.length > 0) {
        console.log(`\n💰 INCOME TRANSACTIONS (Ready to Assign):`);
        
        let excludedCount = 0;
        let excludedTotal = 0;
        
        for (const transaction of incomeTransactions) {
          const payee = transaction.payee || '';
          const isSystemAdjustment = systemAdjustmentPayees.some(adjustmentPayee => 
            payee.includes(adjustmentPayee)
          );
          
          // Transfers are already excluded by the query (transfer_id IS NULL), but double-check
          const isTransfer = transaction.transfer_id !== null;
          
          if (isTransfer || isSystemAdjustment) {
            // Exclude transfers and system adjustments - they're already reflected in working_balance
            excludedCount++;
            excludedTotal += transaction.amount || 0;
            const reason = isTransfer ? 'Transfer (already in account balance)' : 'System adjustment';
            console.log(`   ⚠️  EXCLUDED: $${(transaction.amount || 0).toFixed(2)} - ${payee} (${transaction.date}) [${reason}]`);
          } else {
            // Real income transaction (new money coming in)
            const amount = transaction.amount || 0;
            totalIncome += amount;
            console.log(`   + $${amount.toFixed(2)} - ${payee} (${transaction.date})`);
          }
        }
        
        if (excludedCount > 0) {
          console.log(`   ───────────────────────────────────────────────────────`);
          console.log(`   Excluded ${excludedCount} system adjustment(s): $${excludedTotal.toFixed(2)}`);
        }
      } else {
        console.log(`\n💰 INCOME TRANSACTIONS: None`);
      }
    }

    const total = totalFromAccounts + totalIncome;
    console.log(`   ───────────────────────────────────────────────────────`);
    console.log(`   Total Income: $${totalIncome.toFixed(2)}`);
    console.log(`   ───────────────────────────────────────────────────────`);
    console.log(`   ✅ TOTAL AVAILABLE MONEY: $${total.toFixed(2)}`);

    return total;
  }

  private async calculateTotalAssignedMoney(supabase: SupabaseClient, budgetId: string, userId: string): Promise<number> {
    const { data: categoryBalances, error } = await supabase
      .from('category_balances')
      .select('assigned, category_id, year, month')
      .eq('budget_id', budgetId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    // Get category names for better logging
    const categoryIds = [...new Set(categoryBalances.map(b => b.category_id))];
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .in('id', categoryIds)
      .eq('user_id', userId);

    const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || []);

    console.log(`\n📝 ASSIGNED MONEY (Category Balances):`);
    
    // Sum all assigned amounts across all months (including negative ones)
    // Negative assigned amounts represent money moved back to Ready to Assign
    let totalAssigned = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    let zeroCount = 0;

    for (const balance of categoryBalances) {
      const assigned = balance.assigned || 0;
      totalAssigned += assigned;
      
      if (assigned > 0) positiveCount++;
      else if (assigned < 0) negativeCount++;
      else zeroCount++;

      // Only log non-zero assignments to avoid too much noise
      if (assigned !== 0) {
        const categoryName = categoryMap.get(balance.category_id) || 'Unknown';
        console.log(`   ${assigned >= 0 ? '+' : ''}$${assigned.toFixed(2)} - ${categoryName} (${balance.year}/${balance.month})`);
      }
    }

    console.log(`   ───────────────────────────────────────────────────────`);
    console.log(`   Positive assignments: ${positiveCount}`);
    console.log(`   Negative assignments: ${negativeCount} (money moved back)`);
    console.log(`   Zero assignments: ${zeroCount}`);
    console.log(`   ───────────────────────────────────────────────────────`);
    console.log(`   ✅ TOTAL ASSIGNED MONEY: $${totalAssigned.toFixed(2)}`);

    return totalAssigned;
  }


}
