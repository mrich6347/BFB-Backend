import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { UserDateContextUtils } from '../../common/interfaces/user-date-context.interface';

@Injectable()
export class CreditCardDebtService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Handle YNAB-style automatic money movement for credit card transactions
   * When a credit card transaction is made:
   * 1. Create a credit_card_debt_tracking record
   * 2. Automatically move available money from the spending category to the payment category
   * 3. Track debt_amount and covered_amount
   * Returns the payment category ID if this was a credit card transaction
   */
  async handleCreditCardTransaction(
    transactionId: string,
    accountId: string,
    categoryId: string,
    amount: number,
    budgetId: string,
    userId: string,
    authToken: string,
    userYear?: number,
    userMonth?: number,
    updateCategoryActivityCallback?: (categoryId: string, budgetId: string, date: string, amount: number, userId: string, authToken: string, userCurrentDate?: string, userYear?: number, userMonth?: number) => Promise<any>
  ): Promise<{ paymentCategoryId?: string }> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Check if this is a credit card account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('account_type, name')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account || account.account_type !== 'CREDIT') {
      // Not a credit card transaction, no special handling needed
      return {};
    }

    // Only handle outflow transactions (spending)
    if (amount >= 0) {
      return {};
    }

    const spendingAmount = Math.abs(amount); // Convert to positive amount

    // Get current year and month for balance updates
    const { year: currentYear, month: currentMonth } = UserDateContextUtils.getCurrentUserDate({
      userYear,
      userMonth
    });

    // Find the credit card payment category
    const paymentCategoryName = `${account.name} Payment`;
    const { data: paymentCategory, error: paymentCategoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('name', paymentCategoryName)
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .single();

    if (paymentCategoryError || !paymentCategory) {
      console.error(`Payment category '${paymentCategoryName}' not found for credit card transaction`);
      return {};
    }

    // Get the spending category's current available balance
    const { data: spendingBalance, error: spendingBalanceError } = await supabase
      .from('category_balances')
      .select('available')
      .eq('category_id', categoryId)
      .eq('user_id', userId)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .single();

    if (spendingBalanceError || !spendingBalance) {
      console.error(`Could not find spending category balance for YNAB credit card logic`);
      return {};
    }

    // Calculate how much money we can move (limited by available balance)
    const availableToMove = Math.min(spendingAmount, spendingBalance.available || 0);

    try {
      // Create credit card debt tracking record
      const { data: debtRecord, error: debtError } = await supabase
        .from('credit_card_debt_tracking')
        .insert({
          transaction_id: transactionId,
          credit_card_account_id: accountId,
          original_category_id: categoryId,
          debt_amount: spendingAmount,
          covered_amount: availableToMove,
          user_id: userId,
          budget_id: budgetId
        })
        .select('*')
        .single();

      if (debtError) {
        console.error('Error creating credit card debt tracking record:', debtError);
        return { paymentCategoryId: paymentCategory.id };
      }

      console.log(`✅ Created debt tracking record: debt=$${spendingAmount}, covered=$${availableToMove}`);

      // YNAB Logic: Add to payment category's available balance to represent automatic coverage
      // Only add the amount that was actually covered from the spending category
      // Note: We only update AVAILABLE, not activity or assigned
      if (availableToMove > 0) {
        const { data: paymentBalance } = await supabase
          .from('category_balances')
          .select('available')
          .eq('category_id', paymentCategory.id)
          .eq('user_id', userId)
          .eq('year', currentYear)
          .eq('month', currentMonth)
          .single();

        if (paymentBalance) {
          // Update existing payment category balance - only update available
          await supabase
            .from('category_balances')
            .update({
              available: (paymentBalance.available || 0) + availableToMove
            })
            .eq('category_id', paymentCategory.id)
            .eq('user_id', userId)
            .eq('year', currentYear)
            .eq('month', currentMonth);
        } else {
          // Create new payment category balance - only set available
          await supabase
            .from('category_balances')
            .insert({
              category_id: paymentCategory.id,
              budget_id: budgetId,
              user_id: userId,
              year: currentYear,
              month: currentMonth,
              assigned: 0,
              activity: 0,
              available: availableToMove
            });
        }

        console.log(`✅ YNAB Credit Card Logic: Added $${availableToMove} to available in '${paymentCategoryName}'`);
      } else {
        console.log(`ℹ️ No money available to cover from category to payment category`);
      }

      return { paymentCategoryId: paymentCategory.id };
    } catch (error) {
      console.error('Error in YNAB credit card logic:', error);
      // Don't throw - this is automatic behavior, transaction should still succeed
      return { paymentCategoryId: paymentCategory.id };
    }
  }

  /**
   * Handle YNAB-style automatic money movement for credit card transaction updates
   * When a credit card transaction is updated:
   * 1. Check existing debt tracking record to see how much was originally covered
   * 2. Reverse the original payment category activity
   * 3. Apply new payment category activity based on new transaction amount
   * 4. Update the debt tracking record
   */
  async handleCreditCardTransactionUpdate(
    transactionId: string,
    accountId: string,
    originalTransaction: any,
    updatedTransaction: any,
    budgetId: string,
    userId: string,
    authToken: string,
    userYear?: number,
    userMonth?: number,
    updateCategoryActivityCallback?: (categoryId: string, budgetId: string, date: string, amount: number, userId: string, authToken: string, userCurrentDate?: string, userYear?: number, userMonth?: number) => Promise<any>,
    getCategoryBalanceCallback?: (categoryId: string, budgetId: string, userId: string, authToken: string) => Promise<any>
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Check if this is a credit card account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('account_type, name')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account || account.account_type !== 'CREDIT') {
      // Not a credit card transaction, no special handling needed
      return;
    }

    // Only handle outflow transactions (spending)
    const originalAmount = originalTransaction.amount;
    const newAmount = updatedTransaction.amount;

    if (originalAmount >= 0 && newAmount >= 0) {
      // Neither original nor new transaction is spending, no credit card logic needed
      return;
    }

    try {
      // Get existing debt tracking record
      const { data: existingDebtRecord, error: debtFetchError } = await supabase
        .from('credit_card_debt_tracking')
        .select('*')
        .eq('transaction_id', transactionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (debtFetchError) {
        console.error('Error fetching debt tracking record:', debtFetchError);
        return;
      }

      // Find the payment category for this credit card
      const paymentCategoryName = `${account.name} Payment`;
      const { data: paymentCategory, error: paymentCategoryError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('name', paymentCategoryName)
        .eq('budget_id', budgetId)
        .eq('user_id', userId)
        .single();

      if (paymentCategoryError) {
        console.error(`Payment category '${paymentCategoryName}' not found:`, paymentCategoryError);
        return;
      }

      // If we have an existing debt record, reverse the original payment category available
      if (existingDebtRecord && existingDebtRecord.covered_amount > 0) {
        console.log(`🔄 Reversing original payment category available: -$${existingDebtRecord.covered_amount}`);

        const { year: currentYear, month: currentMonth } = UserDateContextUtils.getCurrentUserDate({
          userYear,
          userMonth
        });

        const { data: paymentBalance } = await supabase
          .from('category_balances')
          .select('available')
          .eq('category_id', paymentCategory.id)
          .eq('user_id', userId)
          .eq('year', currentYear)
          .eq('month', currentMonth)
          .single();

        if (paymentBalance) {
          // Update existing payment category balance - only update available
          await supabase
            .from('category_balances')
            .update({
              available: (paymentBalance.available || 0) - existingDebtRecord.covered_amount
            })
            .eq('category_id', paymentCategory.id)
            .eq('user_id', userId)
            .eq('year', currentYear)
            .eq('month', currentMonth);
        }
      }

      // If the new transaction is spending, apply new credit card logic
      if (newAmount < 0) {
        const newSpendingAmount = Math.abs(newAmount);

        // Get current available balance for the spending category
        const { year: currentYear, month: currentMonth } = UserDateContextUtils.getCurrentUserDate({
          userYear,
          userMonth
        });

        const availableBalance = getCategoryBalanceCallback ?
          await getCategoryBalanceCallback(
            updatedTransaction.category_id,
            budgetId,
            userId,
            authToken
          ) : null;

        // Calculate available to move based on what was originally covered plus any additional available
        // First, get the original covered amount from the debt record
        const originalCoveredAmount = existingDebtRecord ? existingDebtRecord.covered_amount : 0;

        // Then calculate how much additional is available (if any)
        const currentAvailable = Math.max(0, (availableBalance?.available || 0));

        // The total available to move is the original covered amount plus any additional available
        const availableToMove = Math.min(
          newSpendingAmount,
          originalCoveredAmount + currentAvailable
        );

        console.log(`💳 New credit card spending: $${newSpendingAmount}, available to move: $${availableToMove}`);

        // Apply new payment category available - only add the amount that was covered
        // Note: We only update AVAILABLE, not activity or assigned
        if (availableToMove > 0) {
          const { data: paymentBalance } = await supabase
            .from('category_balances')
            .select('available')
            .eq('category_id', paymentCategory.id)
            .eq('user_id', userId)
            .eq('year', currentYear)
            .eq('month', currentMonth)
            .single();

          if (paymentBalance) {
            // Update existing payment category balance - only update available
            await supabase
              .from('category_balances')
              .update({
                available: (paymentBalance.available || 0) + availableToMove
              })
              .eq('category_id', paymentCategory.id)
              .eq('user_id', userId)
              .eq('year', currentYear)
              .eq('month', currentMonth);
          } else {
            // Create new payment category balance - only set available
            await supabase
              .from('category_balances')
              .insert({
                category_id: paymentCategory.id,
                budget_id: budgetId,
                user_id: userId,
                year: currentYear,
                month: currentMonth,
                assigned: 0,
                activity: 0,
                available: availableToMove
              });
          }

          console.log(`✅ YNAB Credit Card Logic Update: Added $${availableToMove} to available in '${paymentCategoryName}'`);
        } else {
          console.log(`ℹ️ No money available to cover from category to payment category`);
        }

        // Update or create debt tracking record
        if (existingDebtRecord) {
          const { error: updateError } = await supabase
            .from('credit_card_debt_tracking')
            .update({
              debt_amount: newSpendingAmount,
              covered_amount: availableToMove,
              original_category_id: updatedTransaction.category_id
            })
            .eq('id', existingDebtRecord.id);

          if (updateError) {
            console.error('Error updating debt tracking record:', updateError);
          } else {
            console.log(`✅ Updated debt tracking record: debt=$${newSpendingAmount}, covered=$${availableToMove}`);
          }
        } else {
          // Create new debt tracking record
          const { error: createError } = await supabase
            .from('credit_card_debt_tracking')
            .insert({
              transaction_id: transactionId,
              credit_card_account_id: accountId,
              original_category_id: updatedTransaction.category_id,
              debt_amount: newSpendingAmount,
              covered_amount: availableToMove,
              user_id: userId,
              budget_id: budgetId
            });

          if (createError) {
            console.error('Error creating debt tracking record:', createError);
          } else {
            console.log(`✅ Created new debt tracking record: debt=$${newSpendingAmount}, covered=$${availableToMove}`);
          }
        }
      } else {
        // Transaction is no longer spending, delete debt tracking record if it exists
        if (existingDebtRecord) {
          const { error: deleteError } = await supabase
            .from('credit_card_debt_tracking')
            .delete()
            .eq('id', existingDebtRecord.id);

          if (deleteError) {
            console.error('Error deleting debt tracking record:', deleteError);
          } else {
            console.log(`✅ Deleted debt tracking record (transaction no longer spending)`);
          }
        }
      }

    } catch (error) {
      console.error('Error handling credit card transaction update:', error);
      // Don't throw - this is supplementary logic, main transaction should still succeed
    }
  }

  /**
   * Handle YNAB-style automatic money movement for credit card transaction deletion
   * When a credit card transaction is deleted:
   * 1. Check existing debt tracking record to see how much was covered
   * 2. Reverse the payment category activity based on covered amount
   * 3. Delete the debt tracking record
   */
  async handleCreditCardTransactionDeletion(
    transactionId: string,
    accountId: string,
    transaction: any,
    budgetId: string,
    userId: string,
    authToken: string,
    updateCategoryActivityCallback?: (categoryId: string, budgetId: string, date: string, amount: number, userId: string, authToken: string) => Promise<any>
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Check if this is a credit card account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('account_type, name')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account || account.account_type !== 'CREDIT') {
      // Not a credit card transaction, no special handling needed
      return;
    }

    // Only handle outflow transactions (spending)
    if (transaction.amount >= 0) {
      return;
    }

    try {
      // Get existing debt tracking record
      const { data: existingDebtRecord, error: debtFetchError } = await supabase
        .from('credit_card_debt_tracking')
        .select('*')
        .eq('transaction_id', transactionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (debtFetchError) {
        console.error('Error fetching debt tracking record for deletion:', debtFetchError);
        return;
      }

      if (!existingDebtRecord) {
        console.log(`ℹ️ No debt tracking record found for transaction ${transactionId}`);
        return;
      }

      // Find the payment category for this credit card
      const paymentCategoryName = `${account.name} Payment`;
      const { data: paymentCategory, error: paymentCategoryError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('name', paymentCategoryName)
        .eq('budget_id', budgetId)
        .eq('user_id', userId)
        .single();

      if (paymentCategoryError) {
        console.error(`Payment category '${paymentCategoryName}' not found:`, paymentCategoryError);
        return;
      }

      // Reverse the payment category available based on covered amount
      // Note: We only update AVAILABLE, not activity or assigned
      if (existingDebtRecord.covered_amount > 0) {
        console.log(`🔄 Reversing payment category available for deletion: -$${existingDebtRecord.covered_amount}`);

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        const { data: paymentBalance } = await supabase
          .from('category_balances')
          .select('available')
          .eq('category_id', paymentCategory.id)
          .eq('user_id', userId)
          .eq('year', currentYear)
          .eq('month', currentMonth)
          .single();

        if (paymentBalance) {
          // Update existing payment category balance - only update available
          await supabase
            .from('category_balances')
            .update({
              available: (paymentBalance.available || 0) - existingDebtRecord.covered_amount
            })
            .eq('category_id', paymentCategory.id)
            .eq('user_id', userId)
            .eq('year', currentYear)
            .eq('month', currentMonth);
        }

        console.log(`✅ YNAB Credit Card Logic Deletion: Removed $${existingDebtRecord.covered_amount} from available in '${paymentCategoryName}'`);
      }

      // Delete the debt tracking record
      const { error: deleteError } = await supabase
        .from('credit_card_debt_tracking')
        .delete()
        .eq('id', existingDebtRecord.id);

      if (deleteError) {
        console.error('Error deleting debt tracking record:', deleteError);
      } else {
        console.log(`✅ Deleted debt tracking record for transaction ${transactionId}`);
      }

    } catch (error) {
      console.error('Error handling credit card transaction deletion:', error);
      // Don't throw - this is supplementary logic, main transaction should still succeed
    }
  }

  /**
   * Handle YNAB-style automatic money movement for credit card assignments
   * When money is assigned to a category that has existing credit card debt:
   * 1. Check for uncovered credit card debt for this category
   * 2. Automatically move assigned money to corresponding payment categories
   * 3. Update debt tracking records
   * Returns array of payment category IDs that were affected
   */
  async handleCreditCardLogicForAssignments(
    appliedCategories: { category_id: string; amount: number }[],
    budgetId: string,
    userId: string,
    authToken: string,
    year: number,
    month: number
  ): Promise<string[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    console.log(`🔍 YNAB Credit Card Assignment Logic: Checking ${appliedCategories.length} categories for credit card debt`);

    const affectedPaymentCategoryIds: string[] = [];

    try {
      for (const appliedCategory of appliedCategories) {
        console.log(`🔍 Checking category ${appliedCategory.category_id} for credit card debt (assigned: $${appliedCategory.amount})`);

        // Find uncovered credit card debt for this category
        const { data: debtRecords, error: debtError } = await supabase
          .from('credit_card_debt_tracking')
          .select(`
            id,
            debt_amount,
            covered_amount,
            credit_card_account_id,
            accounts!credit_card_debt_tracking_credit_card_account_id_fkey(name, account_type)
          `)
          .eq('original_category_id', appliedCategory.category_id)
          .eq('user_id', userId)
          .eq('budget_id', budgetId);

        if (debtError) {
          console.error('Error fetching debt records:', debtError);
          continue;
        }

        console.log(`🔍 Found ${debtRecords?.length || 0} debt records for category ${appliedCategory.category_id}`);

        if (!debtRecords || debtRecords.length === 0) {
          // No credit card debt for this category
          console.log(`ℹ️ No credit card debt found for category ${appliedCategory.category_id}`);
          continue;
        }

        // Process each debt record for this category
        for (const debtRecord of debtRecords) {
          const uncoveredAmount = debtRecord.debt_amount - debtRecord.covered_amount;

          if (uncoveredAmount <= 0) {
            // This debt is already fully covered
            continue;
          }

          // Calculate how much of the assigned money should go to this debt
          const amountToMove = Math.min(appliedCategory.amount, uncoveredAmount);

          if (amountToMove <= 0) {
            continue;
          }

          console.log(`💳 YNAB Credit Card Assignment Logic: Moving $${amountToMove} from category to payment category for debt ${debtRecord.id}`);

          // Find the payment category for this credit card
          const account = Array.isArray(debtRecord.accounts) ? debtRecord.accounts[0] : debtRecord.accounts;
          const paymentCategoryName = `${account.name} Payment`;
          const { data: paymentCategory, error: paymentCategoryError } = await supabase
            .from('categories')
            .select('id, name')
            .eq('name', paymentCategoryName)
            .eq('budget_id', budgetId)
            .eq('user_id', userId)
            .single();

          if (paymentCategoryError) {
            console.error(`Payment category '${paymentCategoryName}' not found:`, paymentCategoryError);
            continue;
          }

          // Move money from spending category to payment category
          // Note: We don't need to modify the spending category's balance here
          // The assignment already happened in pullFromReadyToAssign, and the credit card logic
          // is just moving the coverage to the payment category without affecting the spending category

          // 2. Add to payment category's available (represents automatic coverage)
          // Note: We only update AVAILABLE, not activity or assigned
          const { data: paymentBalance } = await supabase
            .from('category_balances')
            .select('available')
            .eq('category_id', paymentCategory.id)
            .eq('user_id', userId)
            .eq('year', year)
            .eq('month', month)
            .single();

          if (paymentBalance) {
            // Update existing payment category balance - only update available
            await supabase
              .from('category_balances')
              .update({
                available: (paymentBalance.available || 0) + amountToMove
              })
              .eq('category_id', paymentCategory.id)
              .eq('user_id', userId)
              .eq('year', year)
              .eq('month', month);
          } else {
            // Create new payment category balance - only set available
            await supabase
              .from('category_balances')
              .insert({
                category_id: paymentCategory.id,
                budget_id: budgetId,
                user_id: userId,
                year: year,
                month: month,
                assigned: 0,
                activity: 0,
                available: amountToMove
              });
          }

          // 3. Update debt tracking record to reflect the new covered amount
          await supabase
            .from('credit_card_debt_tracking')
            .update({
              covered_amount: debtRecord.covered_amount + amountToMove
            })
            .eq('id', debtRecord.id);

          console.log(`✅ YNAB Credit Card Assignment Logic: Moved $${amountToMove} to '${paymentCategoryName}', updated debt coverage`);

          // Track the affected payment category
          if (!affectedPaymentCategoryIds.includes(paymentCategory.id)) {
            affectedPaymentCategoryIds.push(paymentCategory.id);
          }

          // Reduce the remaining amount to assign for this category
          appliedCategory.amount -= amountToMove;

          if (appliedCategory.amount <= 0) {
            break; // No more money to move for this category
          }
        }
      }
    } catch (error) {
      console.error('Error handling credit card logic for assignments:', error);
      // Don't throw - this is supplementary logic, main assignment should still succeed
    }

    return affectedPaymentCategoryIds;
  }
}
