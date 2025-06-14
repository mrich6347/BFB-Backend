import { Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateTransactionDto, UpdateTransactionDto, TransactionResponse } from './dto/transaction.dto';
import { CategoryBalancesService } from '../category-balances/category-balances.service';
import { DebtTrackingService } from '../debt-tracking/debt-tracking.service';

@Injectable()
export class TransactionsService {
  private supabase: SupabaseClient;

  constructor(
    private supabaseService: SupabaseService,
    private categoryBalancesService: CategoryBalancesService,
    private debtTrackingService: DebtTrackingService
  ) {
    this.supabase = this.supabaseService.client;
  }

  async create(createTransactionDto: CreateTransactionDto, userId: string, authToken: string): Promise<TransactionResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Handle special "ready-to-assign" category
    const isReadyToAssign = createTransactionDto.category_id === 'ready-to-assign';

    const payload = {
      ...createTransactionDto,
      user_id: userId,
      is_cleared: createTransactionDto.is_cleared ?? false,
      is_reconciled: createTransactionDto.is_reconciled ?? false,
      // Store null for ready-to-assign transactions
      category_id: isReadyToAssign ? null : createTransactionDto.category_id,
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Update category activity if transaction has a category (but not for ready-to-assign)
    if (data.category_id && data.amount !== 0 && !isReadyToAssign) {
      const budgetId = await this.getBudgetIdFromAccount(data.account_id, userId, authToken);

      if (budgetId) {
        try {
          await this.updateCategoryActivity(
            data.category_id,
            budgetId,
            data.date,
            data.amount,
            userId,
            authToken
          );

          // Handle credit card spending logic
          const isCreditCard = await this.isCreditCardTransaction(data.account_id, userId, authToken);
          if (isCreditCard && data.amount < 0) { // Negative amount = spending
            console.log('🏦 Processing credit card spending transaction');
            await this.handleCreditCardSpending(
              data,
              data.category_id,
              budgetId,
              data.date,
              data.amount,
              userId,
              authToken
            );
          }
        } catch (activityError) {
          console.error('Error updating category activity or credit card logic:', activityError);
          // Don't throw here - transaction was created successfully, activity update is secondary
        }
      }
    }

    // Update account balances after creating transaction
    console.log(`🆕 Transaction created, updating account balances for account: ${data.account_id}`);
    try {
      await this.updateAccountBalances(data.account_id, userId, authToken);
    } catch (balanceError) {
      console.error('❌ Error updating account balances:', balanceError);
      // Don't throw here - transaction was created successfully, balance update is secondary
    }

    return data;
  }

  async findAllByAccount(accountId: string, userId: string, authToken: string): Promise<TransactionResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  async findAllByBudget(budgetId: string, userId: string, authToken: string): Promise<TransactionResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);


    // First get all account IDs for this budget
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id')
      .eq('budget_id', budgetId)
      .eq('user_id', userId);

    if (accountsError) {
      console.error('Error fetching accounts:', accountsError);
      throw new Error(accountsError.message);
    }


    if (!accounts || accounts.length === 0) {
      return [];
    }

    const accountIds = accounts.map(account => account.id);

    // Then get all transactions for those accounts
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .in('account_id', accountIds)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      throw new Error(error.message);
    }

    return data || [];
  }

  async findOne(id: string, userId: string, authToken: string): Promise<TransactionResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async update(id: string, updateTransactionDto: UpdateTransactionDto, userId: string, authToken: string): Promise<TransactionResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // First get the original transaction to compare changes
    const { data: originalTransaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    // Handle special "ready-to-assign" category
    const isReadyToAssign = updateTransactionDto.category_id === 'ready-to-assign';
    const wasReadyToAssign = originalTransaction.category_id === null;

    // Prepare update payload
    const updatePayload = {
      ...updateTransactionDto,
      // Store null for ready-to-assign transactions
      category_id: isReadyToAssign ? null : updateTransactionDto.category_id,
    };

    // Update the transaction
    const { data, error } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Handle category activity updates if relevant fields changed
    const budgetId = await this.getBudgetIdFromAccount(data.account_id, userId, authToken);

    if (budgetId) {
      try {
        // Check if category changed
        const categoryChanged = originalTransaction.category_id !== data.category_id;
        const amountChanged = originalTransaction.amount !== data.amount;
        const dateChanged = originalTransaction.date !== data.date;

        // If category changed, reverse activity from old category (but not if it was ready-to-assign)
        if (categoryChanged && originalTransaction.category_id && originalTransaction.amount !== 0 && !wasReadyToAssign) {
          await this.updateCategoryActivity(
            originalTransaction.category_id,
            budgetId,
            originalTransaction.date,
            -originalTransaction.amount, // Reverse the original amount
            userId,
            authToken
          );
        }

        // If amount changed but category stayed the same, adjust the difference (but not for ready-to-assign)
        if (!categoryChanged && amountChanged && data.category_id && originalTransaction.category_id && !isReadyToAssign && !wasReadyToAssign) {
          const amountDifference = data.amount - originalTransaction.amount;
          const dateToUse = dateChanged ? data.date : originalTransaction.date;

          await this.updateCategoryActivity(
            data.category_id,
            budgetId,
            dateToUse,
            amountDifference,
            userId,
            authToken
          );
        }

        // If category changed to a new category, add activity to new category (but not for ready-to-assign)
        if (categoryChanged && data.category_id && data.amount !== 0 && !isReadyToAssign) {
          await this.updateCategoryActivity(
            data.category_id,
            budgetId,
            data.date,
            data.amount,
            userId,
            authToken
          );
        }

        // If date changed but category and amount stayed the same, we need to move the activity (but not for ready-to-assign)
        if (dateChanged && !categoryChanged && !amountChanged && data.category_id && data.amount !== 0 && !isReadyToAssign && !wasReadyToAssign) {
          // Remove from old date
          await this.updateCategoryActivity(
            data.category_id,
            budgetId,
            originalTransaction.date,
            -data.amount,
            userId,
            authToken
          );

          // Add to new date
          await this.updateCategoryActivity(
            data.category_id,
            budgetId,
            data.date,
            data.amount,
            userId,
            authToken
          );
        }
      } catch (activityError) {
        console.error('Error updating category activity:', activityError);
        // Don't throw here - transaction was updated successfully, activity update is secondary
      }
    }

    // Update account balances after updating transaction
    try {
      await this.updateAccountBalances(data.account_id, userId, authToken);

      // If account changed, also update the old account
      if (originalTransaction.account_id !== data.account_id) {
        await this.updateAccountBalances(originalTransaction.account_id, userId, authToken);
      }
    } catch (balanceError) {
      console.error('Error updating account balances:', balanceError);
      // Don't throw here - transaction was updated successfully, balance update is secondary
    }

    return data;
  }

  async remove(id: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // First get the transaction to reverse its activity
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    // IMPORTANT: Handle credit card reversal BEFORE deleting transaction
    // The debt_tracking table has ON DELETE CASCADE for transaction_id, so debt records
    // are automatically deleted when the transaction is deleted. We must reverse the
    // credit card spending while the debt records still exist.
    const wasReadyToAssign = transaction.category_id === null;
    if (transaction.category_id && transaction.amount !== 0 && !wasReadyToAssign) {
      const budgetId = await this.getBudgetIdFromAccount(transaction.account_id, userId, authToken);

      if (budgetId) {
        try {
          // Handle credit card transaction deletion FIRST (before deleting transaction)
          const isCreditCard = await this.isCreditCardTransaction(transaction.account_id, userId, authToken);
          if (isCreditCard && transaction.amount < 0) { // Was a spending transaction
            console.log('🏦 Reversing credit card spending transaction BEFORE deletion');
            await this.reverseCreditCardSpending(
              transaction.id,
              transaction.category_id,
              budgetId,
              transaction.date,
              transaction.amount,
              userId,
              authToken
            );
            // For credit card transactions, the reversal logic handles both the payment category
            // and the original category balance updates, so we skip the regular category activity reversal
            console.log('ℹ️ Skipping regular category activity reversal for credit card transaction');
          } else {
            // For non-credit card transactions, do the regular category activity reversal
            await this.updateCategoryActivity(
              transaction.category_id,
              budgetId,
              transaction.date,
              -transaction.amount, // Reverse the amount
              userId,
              authToken
            );
          }
        } catch (activityError) {
          console.error('Error reversing category activity or credit card logic:', activityError);
          // Don't throw here - we still want to delete the transaction
        }
      }
    }

    // NOW delete the transaction (debt records will be automatically deleted due to CASCADE)
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    // Update account balances after deleting transaction
    try {
      await this.updateAccountBalances(transaction.account_id, userId, authToken);
    } catch (balanceError) {
      console.error('Error updating account balances:', balanceError);
      // Don't throw here - transaction was deleted successfully, balance update is secondary
    }
  }

  async toggleCleared(id: string, userId: string, authToken: string): Promise<TransactionResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // First get the current transaction
    const { data: currentTransaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    // Toggle the cleared status
    const { data, error } = await supabase
      .from('transactions')
      .update({ is_cleared: !currentTransaction.is_cleared })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Update account balances after toggling cleared status
    try {
      await this.updateAccountBalances(data.account_id, userId, authToken);
    } catch (balanceError) {
      console.error('Error updating account balances:', balanceError);
      // Don't throw here - transaction was updated successfully, balance update is secondary
    }

    return data;
  }

  /**
   * Helper method to get budget_id from account_id
   */
  private async getBudgetIdFromAccount(accountId: string, userId: string, authToken: string): Promise<string | null> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('accounts')
      .select('budget_id')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching account budget_id:', error);
      return null;
    }

    return data?.budget_id || null;
  }

  /**
   * Helper method to update category activity for a transaction
   * New logic:
   * - Activity: Update for the transaction's actual month (historical accuracy)
   * - Available: Always update current month (where user can manage the impact)
   * - Date validation: Allow past transactions but not future ones
   */
  private async updateCategoryActivity(
    categoryId: string,
    budgetId: string,
    transactionDate: string,
    amount: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    // Validate transaction date - no future transactions allowed
    const transactionDateObj = new Date(transactionDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today

    if (transactionDateObj > today) {
      throw new Error('Future transactions are not allowed');
    }

    // Extract year and month from transaction date for activity tracking
    const transactionYear = transactionDateObj.getFullYear();
    const transactionMonth = transactionDateObj.getMonth() + 1;

    // Get current year and month for available balance updates
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Update activity for the transaction's actual month
    await this.updateActivityForMonth(
      categoryId,
      budgetId,
      transactionYear,
      transactionMonth,
      amount,
      userId,
      authToken
    );

    // Update available balance for current month (only if different from transaction month)
    if (transactionYear !== currentYear || transactionMonth !== currentMonth) {
      await this.updateAvailableForCurrentMonth(
        categoryId,
        budgetId,
        currentYear,
        currentMonth,
        amount,
        userId,
        authToken
      );
    }
  }

  /**
   * Update activity for a specific month (transaction's actual month)
   */
  private async updateActivityForMonth(
    categoryId: string,
    budgetId: string,
    year: number,
    month: number,
    amount: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    const existingBalance = await this.categoryBalancesService.findByCategory(
      categoryId,
      year,
      month,
      userId,
      authToken
    );

    if (existingBalance) {
      // Update existing balance - only update activity
      const newActivity = (existingBalance.activity || 0) + amount;

      // For current month transactions, also update available
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      const updateData: any = { activity: newActivity };

      if (year === currentYear && month === currentMonth) {
        // Current month transaction - update both activity and available
        updateData.available = (existingBalance.available || 0) + amount;
      }

      await this.categoryBalancesService.updateByCategoryAndMonth(
        categoryId,
        year,
        month,
        updateData,
        userId,
        authToken
      );
    } else {
      // Create new balance record for the transaction month
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      const balanceData: any = {
        activity: amount,
        assigned: 0
      };

      if (year === currentYear && month === currentMonth) {
        // Current month transaction - set available
        balanceData.available = amount;
      } else {
        // Past month transaction - don't affect available in past month
        balanceData.available = 0;
      }

      await this.categoryBalancesService.createOrUpdateByCategoryAndMonth(
        categoryId,
        budgetId,
        year,
        month,
        balanceData,
        userId,
        authToken
      );
    }
  }

  /**
   * Update available balance for current month (for past transactions)
   */
  private async updateAvailableForCurrentMonth(
    categoryId: string,
    budgetId: string,
    currentYear: number,
    currentMonth: number,
    amount: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    const existingBalance = await this.categoryBalancesService.findByCategory(
      categoryId,
      currentYear,
      currentMonth,
      userId,
      authToken
    );

    if (existingBalance) {
      // Update existing current month balance - only update available
      const newAvailable = (existingBalance.available || 0) + amount;

      await this.categoryBalancesService.updateByCategoryAndMonth(
        categoryId,
        currentYear,
        currentMonth,
        { available: newAvailable },
        userId,
        authToken
      );
    } else {
      // Create new current month balance with only available affected
      await this.categoryBalancesService.createOrUpdateByCategoryAndMonth(
        categoryId,
        budgetId,
        currentYear,
        currentMonth,
        {
          assigned: 0,
          activity: 0,
          available: amount // Only available is affected for past transactions
        },
        userId,
        authToken
      );
    }
  }

  async markTransactionsAsReconciled(accountId: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Mark all cleared transactions for this account as reconciled
    const { error } = await supabase
      .from('transactions')
      .update({ is_reconciled: true })
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .eq('is_cleared', true)
      .eq('is_reconciled', false); // Only update transactions that aren't already reconciled

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Check if the account is a credit card account
   */
  private async isCreditCardTransaction(accountId: string, userId: string, authToken: string): Promise<boolean> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data: account, error } = await supabase
      .from('accounts')
      .select('account_type')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error checking account type:', error);
      return false;
    }

    return account?.account_type === 'CREDIT';
  }

  /**
   * Find the payment category linked to a credit card account
   */
  private async findPaymentCategoryForCreditCard(accountId: string, userId: string, authToken: string): Promise<string | null> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data: category, error } = await supabase
      .from('categories')
      .select('id')
      .eq('is_credit_card_payment', true)
      .eq('linked_account_id', accountId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error finding payment category:', error);
      return null;
    }

    return category?.id || null;
  }

  /**
   * Handle credit card spending with automatic money movement and debt tracking
   */
  private async handleCreditCardSpending(
    transaction: any,
    categoryId: string,
    budgetId: string,
    transactionDate: string,
    amount: number, // negative for spending
    userId: string,
    authToken: string
  ): Promise<void> {
    console.log(`🏦 Handling credit card spending: ${amount} for transaction ${transaction.id}`);

    // Find the payment category for this credit card
    const paymentCategoryId = await this.findPaymentCategoryForCreditCard(transaction.account_id, userId, authToken);
    if (!paymentCategoryId) {
      console.error('❌ No payment category found for credit card account:', transaction.account_id);
      return;
    }

    console.log(`💳 Found payment category: ${paymentCategoryId}`);

    // Get transaction month/year
    const transactionDateObj = new Date(transactionDate);
    const transactionYear = transactionDateObj.getFullYear();
    const transactionMonth = transactionDateObj.getMonth() + 1;

    console.log(`📅 Transaction date: ${transactionYear}-${transactionMonth}`);

    // Get current available balance for the spending category (for transaction month)
    const categoryBalance = await this.categoryBalancesService.findByCategory(
      categoryId,
      transactionYear,
      transactionMonth,
      userId,
      authToken
    );

    console.log(`💰 Category balance for ${categoryId}:`, categoryBalance);

    const availableBalance = categoryBalance?.available || 0;
    const spendingAmount = Math.abs(amount); // Convert to positive for calculations

    // Calculate coverage amounts
    const coveredAmount = Math.max(0, Math.min(availableBalance, spendingAmount));
    const debtAmount = spendingAmount;

    console.log(`💳 Spending: ${spendingAmount}, Available: ${availableBalance}, Covered: ${coveredAmount}`);

    // Transfer covered amount to payment category (if any)
    if (coveredAmount > 0) {
      console.log(`💸 Transferring ${coveredAmount} to payment category ${paymentCategoryId}`);
      await this.transferMoneyToPaymentCategory(
        categoryId,
        paymentCategoryId,
        budgetId,
        coveredAmount,
        transactionYear,
        transactionMonth,
        userId,
        authToken
      );
      console.log(`✅ Transfer complete`);
    } else {
      console.log(`ℹ️ No money to transfer (covered amount = 0)`);
    }

    // ALWAYS create debt tracking record for credit card transactions
    // This ensures we can properly reverse the transaction when deleted
    console.log(`📝 Creating debt tracking record: debt=${debtAmount}, covered=${coveredAmount}`);

    await this.debtTrackingService.createDebtRecord(
      transaction.id,
      categoryId,
      paymentCategoryId,
      debtAmount,
      coveredAmount,
      budgetId,
      userId,
      authToken
    );

    if (coveredAmount >= spendingAmount) {
      console.log(`✅ Fully covered spending of ${spendingAmount}`);
    } else if (coveredAmount > 0) {
      console.log(`⚠️ Partially covered spending. Covered: ${coveredAmount}, Remaining debt: ${debtAmount - coveredAmount}`);
    } else {
      console.log(`⚠️ Uncovered spending. Full debt: ${debtAmount}`);
    }


  }

  /**
   * Reverse credit card spending when transaction is deleted
   */
  private async reverseCreditCardSpending(
    transactionId: string,
    categoryId: string,
    budgetId: string,
    transactionDate: string,
    amount: number, // negative for spending
    userId: string,
    authToken: string
  ): Promise<void> {
    console.log(`🔄 Reversing credit card spending: ${amount} for transaction ${transactionId}`);

    // Get debt tracking records for this transaction
    const debtRecords = await this.debtTrackingService.getDebtRecordsForTransaction(transactionId, userId, authToken);
    console.log(`📊 Found ${debtRecords.length} debt records for reversal`);

    if (debtRecords.length > 0) {
      const debtRecord = debtRecords[0]; // Should only be one per transaction

      console.log(`📊 Debt record details:`, {
        id: debtRecord.id,
        debt_amount: debtRecord.debt_amount,
        covered_amount: debtRecord.covered_amount,
        payment_category_id: debtRecord.payment_category_id,
        category_id: debtRecord.category_id
      });

      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      // Use the covered_amount from debt record to know how much was actually moved to payment category
      const totalMovedToPayment = debtRecord.covered_amount;
      const spendingAmount = Math.abs(amount);

      console.log(`🔄 Reversing ${totalMovedToPayment} from payment category ${debtRecord.payment_category_id} to ${categoryId}`);

      if (totalMovedToPayment > 0) {
        // Remove money from payment category (current month)
        await this.updateCategoryBalance(
          debtRecord.payment_category_id,
          budgetId,
          currentYear,
          currentMonth,
          -totalMovedToPayment,
          'available',
          userId,
          authToken
        );

        // Remove activity from payment category (current month)
        await this.updateCategoryBalance(
          debtRecord.payment_category_id,
          budgetId,
          currentYear,
          currentMonth,
          -totalMovedToPayment,
          'activity',
          userId,
          authToken
        );

        // Put money back into the spending category (current month)
        await this.updateCategoryBalance(
          categoryId,
          budgetId,
          currentYear,
          currentMonth,
          totalMovedToPayment,
          'available',
          userId,
          authToken
        );

        // Also reverse the activity in the original category since the transaction is being deleted
        // Activity should be reversed for the transaction's original month, not current month
        const transactionDateObj = new Date(transactionDate);
        const transactionYear = transactionDateObj.getFullYear();
        const transactionMonth = transactionDateObj.getMonth() + 1;
        const spendingAmount = Math.abs(amount);

        console.log(`🔄 Reversing activity: +${spendingAmount} for ${transactionYear}-${transactionMonth}`);
        await this.updateCategoryBalance(
          categoryId,
          budgetId,
          transactionYear,
          transactionMonth,
          spendingAmount, // Reverse the full transaction amount
          'activity',
          userId,
          authToken
        );

        console.log(`✅ Successfully reversed ${totalMovedToPayment} from payment category to spending category`);
      } else {
        console.log(`ℹ️ No money to reverse (covered_amount = 0) - transaction was not covered`);
      }

      // Note: Debt tracking records will be automatically deleted when transaction is deleted (CASCADE)
      console.log(`✅ Credit card spending reversal complete`);
    } else {
      console.log(`⚠️ No debt records found for transaction ${transactionId}`);
    }
  }

  /**
   * Transfer money from spending category to payment category
   */
  private async transferMoneyToPaymentCategory(
    fromCategoryId: string,
    toCategoryId: string,
    budgetId: string,
    amount: number,
    year: number,
    month: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    console.log(`💸 Transferring ${amount} from category ${fromCategoryId} to payment category ${toCategoryId}`);

    // Decrease available balance in spending category
    await this.updateCategoryBalance(fromCategoryId, budgetId, year, month, -amount, 'available', userId, authToken);

    // Increase available balance in payment category (current month)
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    await this.updateCategoryBalance(toCategoryId, budgetId, currentYear, currentMonth, amount, 'available', userId, authToken);

    // Add activity to payment category (current month) - this is key for YNAB behavior
    await this.updateCategoryBalance(toCategoryId, budgetId, currentYear, currentMonth, amount, 'activity', userId, authToken);
  }



  /**
   * Update category balance for a specific field
   */
  private async updateCategoryBalance(
    categoryId: string,
    budgetId: string,
    year: number,
    month: number,
    amount: number,
    field: 'available' | 'assigned' | 'activity',
    userId: string,
    authToken: string
  ): Promise<void> {
    console.log(`💰 Updating category ${categoryId} ${field} by ${amount} for ${year}-${month}`);

    const existingBalance = await this.categoryBalancesService.findByCategory(
      categoryId,
      year,
      month,
      userId,
      authToken
    );

    console.log(`💰 Existing balance for category ${categoryId}:`, existingBalance);

    if (existingBalance) {
      const oldValue = existingBalance[field] || 0;
      const newValue = oldValue + amount;
      const updateData = {
        [field]: newValue
      };

      console.log(`💰 Updating ${field}: ${oldValue} + ${amount} = ${newValue}`);

      await this.categoryBalancesService.updateByCategoryAndMonth(
        categoryId,
        year,
        month,
        updateData,
        userId,
        authToken
      );
    } else {
      // Create new balance record
      const balanceData = {
        assigned: 0,
        activity: 0,
        available: 0,
        [field]: amount
      };

      console.log(`💰 Creating new balance record for category ${categoryId} with ${field} = ${amount}`);

      await this.categoryBalancesService.createOrUpdateByCategoryAndMonth(
        categoryId,
        budgetId,
        year,
        month,
        balanceData,
        userId,
        authToken
      );
    }
  }

  /**
   * Cover credit card debt using FIFO (First In, First Out) approach
   * This is called when money is added to a category that has uncovered debt
   */
  private async coverCreditCardDebt(
    categoryId: string,
    availableAmount: number,
    currentMonth: number,
    currentYear: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    if (availableAmount <= 0) return;

    console.log(`💰 Attempting to cover debt for category ${categoryId} with ${availableAmount}`);

    // Get all uncovered debt records for this category using the debt tracking service
    const uncoveredDebts = await this.debtTrackingService.getUncoveredDebts(categoryId, userId, authToken);

    if (uncoveredDebts.length === 0) {
      console.log('No uncovered debt found for category');
      return;
    }

    let remainingAmount = availableAmount;

    for (const debtRecord of uncoveredDebts) {
      if (remainingAmount <= 0) break;

      const uncoveredDebt = debtRecord.debt_amount - debtRecord.covered_amount;
      const coverageAmount = Math.min(remainingAmount, uncoveredDebt);

      if (coverageAmount > 0) {
        console.log(`📝 Covering ${coverageAmount} of debt record ${debtRecord.id}`);

        // Update the debt record using the service
        try {
          await this.debtTrackingService.updateDebtCoverage(debtRecord.id, coverageAmount, userId, authToken);
        } catch (updateError) {
          console.error('Error updating debt record:', updateError);
          continue;
        }

        // Transfer money to payment category (current month)
        await this.handleCrossMonthDebtCoverage(
          debtRecord,
          coverageAmount,
          currentMonth,
          currentYear,
          userId,
          authToken
        );

        remainingAmount -= coverageAmount;
      }
    }

    console.log(`✅ Debt coverage complete. Remaining amount: ${remainingAmount}`);
  }

  /**
   * Handle cross-month debt coverage by moving money to payment category
   */
  private async handleCrossMonthDebtCoverage(
    debtRecord: any,
    coverageAmount: number,
    currentMonth: number,
    currentYear: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    console.log(`🔄 Handling cross-month debt coverage: ${coverageAmount} to payment category ${debtRecord.payment_category_id}`);

    // Add money to the payment category's available balance for CURRENT month
    await this.updateCategoryBalance(
      debtRecord.payment_category_id,
      debtRecord.budget_id,
      currentYear,
      currentMonth,
      coverageAmount,
      'available',
      userId,
      authToken
    );

    // Add activity to payment category (current month) - this is key for YNAB behavior
    await this.updateCategoryBalance(
      debtRecord.payment_category_id,
      debtRecord.budget_id,
      currentYear,
      currentMonth,
      coverageAmount,
      'activity',
      userId,
      authToken
    );
  }

  /**
   * Public method to handle debt coverage when money is assigned to categories
   * This is called from the categories service when assigned amounts are updated
   */
  async handleDebtCoverageForCategory(
    categoryId: string,
    assignedAmountIncrease: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    if (assignedAmountIncrease <= 0) return;

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    await this.coverCreditCardDebt(
      categoryId,
      assignedAmountIncrease,
      currentMonth,
      currentYear,
      userId,
      authToken
    );
  }

  /**
   * Update account balances based on current transactions
   * Logic:
   * - Cleared Balance = Account Balance (starting balance) + Sum of Cleared Transactions
   * - Uncleared Balance = Sum of Uncleared Transactions
   * - Working Balance = Cleared Balance + Uncleared Balance
   */
  private async updateAccountBalances(accountId: string, userId: string, authToken: string): Promise<void> {
    console.log(`🔄 Updating account balances for account: ${accountId}`);
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get all transactions for this account
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('amount, is_cleared')
      .eq('account_id', accountId)
      .eq('user_id', userId);

    if (transactionsError) {
      throw new Error(transactionsError.message);
    }

    // Get current account to get the account_balance (starting balance)
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('account_balance')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError) {
      throw new Error(accountError.message);
    }

    // Calculate transaction totals
    let clearedTransactionTotal = 0;
    let unclearedTransactionTotal = 0;

    console.log(`🔍 Processing ${transactions.length} transactions for account ${accountId}:`);
    for (const transaction of transactions) {
      const amount = parseFloat(transaction.amount.toString());
      console.log(`  Transaction: amount=${amount}, is_cleared=${transaction.is_cleared}`);
      if (transaction.is_cleared) {
        clearedTransactionTotal += amount;
      } else {
        unclearedTransactionTotal += amount;
      }
    }
    console.log(`📊 Transaction totals: cleared=${clearedTransactionTotal}, uncleared=${unclearedTransactionTotal}`);

    // Get the starting balance from the account_balance field
    const accountBalance = parseFloat(account.account_balance.toString());

    // Calculate the correct balances using the simple, clear formula
    const newClearedBalance = accountBalance + clearedTransactionTotal;
    const newUnclearedBalance = unclearedTransactionTotal;
    const newWorkingBalance = newClearedBalance + newUnclearedBalance;

    console.log(`💰 Account balance calculation:`, {
      accountId,
      accountBalance,
      clearedTransactionTotal,
      unclearedTransactionTotal,
      newClearedBalance,
      newUnclearedBalance,
      newWorkingBalance
    });

    // Update the account with new balances
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        cleared_balance: newClearedBalance,
        uncleared_balance: newUnclearedBalance,
        working_balance: newWorkingBalance
      })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updateError) {
      console.error(`❌ Error updating account balances:`, updateError);
      throw new Error(updateError.message);
    }

    console.log(`✅ Successfully updated account balances for account: ${accountId}`);
  }


}
