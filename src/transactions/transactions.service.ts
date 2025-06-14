import { Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateTransactionDto, UpdateTransactionDto, TransactionResponse } from './dto/transaction.dto';
import { CategoryBalancesService } from '../category-balances/category-balances.service';

@Injectable()
export class TransactionsService {
  private supabase: SupabaseClient;

  constructor(
    private supabaseService: SupabaseService,
    private categoryBalancesService: CategoryBalancesService
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
          // For cash transactions, update category activity
          await this.updateCategoryActivity(
            data.category_id,
            budgetId,
            data.date,
            data.amount,
            userId,
            authToken
          );
        } catch (activityError) {
          console.error('Error updating category activity:', activityError);
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

    // Reverse category activity before deleting transaction
    const wasReadyToAssign = transaction.category_id === null;
    if (transaction.category_id && transaction.amount !== 0 && !wasReadyToAssign) {
      const budgetId = await this.getBudgetIdFromAccount(transaction.account_id, userId, authToken);

      if (budgetId) {
        try {
          // For cash transactions, do the regular category activity reversal
          await this.updateCategoryActivity(
            transaction.category_id,
            budgetId,
            transaction.date,
            -transaction.amount, // Reverse the amount
            userId,
            authToken
          );
        } catch (activityError) {
          console.error('Error reversing category activity:', activityError);
          // Don't throw here - we still want to delete the transaction
        }
      }
    }

    // Now delete the transaction
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
   * Helper method to update ONLY category activity (not available balance)
   * This method is used for special cases where only activity should be updated
   * without affecting the available balance
   */
  private async updateCategoryActivityOnly(
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

    console.log(`🔄 Updating ONLY activity for category ${categoryId} in ${transactionYear}-${transactionMonth} by ${amount}`);

    // Update ONLY activity for the transaction's actual month
    await this.updateCategoryBalance(
      categoryId,
      budgetId,
      transactionYear,
      transactionMonth,
      amount,
      'activity',
      userId,
      authToken
    );

    console.log(`✅ Activity-only update complete`);
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
   * Recalculate available balance based on assigned + activity (YNAB formula)
   */
  private async recalculateAvailableBalance(
    categoryId: string,
    budgetId: string,
    year: number,
    month: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    console.log(`🧮 Recalculating available balance for category ${categoryId} in ${year}-${month}`);

    // Get current balance
    const existingBalance = await this.categoryBalancesService.findByCategory(
      categoryId,
      year,
      month,
      userId,
      authToken
    );

    if (existingBalance) {
      const assigned = existingBalance.assigned || 0;
      const activity = existingBalance.activity || 0;
      const newAvailable = assigned + activity;

      console.log(`🧮 Balance calculation: assigned(${assigned}) + activity(${activity}) = available(${newAvailable})`);

      await this.categoryBalancesService.updateByCategoryAndMonth(
        categoryId,
        year,
        month,
        { available: newAvailable },
        userId,
        authToken
      );

      console.log(`✅ Available balance recalculated successfully`);
    } else {
      console.log(`⚠️ No existing balance found for category ${categoryId} in ${year}-${month}`);
    }
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
    console.log(`💰 ========== UPDATE CATEGORY BALANCE START ==========`);
    console.log(`💰 Category ID: ${categoryId}`);
    console.log(`💰 Budget ID: ${budgetId}`);
    console.log(`💰 Year/Month: ${year}/${month}`);
    console.log(`💰 Amount: ${amount}`);
    console.log(`💰 Field: ${field}`);
    console.log(`💰 User ID: ${userId}`);

    console.log(`💰 Fetching existing balance...`);
    const existingBalance = await this.categoryBalancesService.findByCategory(
      categoryId,
      year,
      month,
      userId,
      authToken
    );

    console.log(`💰 Existing balance result:`, JSON.stringify(existingBalance, null, 2));

    if (existingBalance) {
      const oldValue = existingBalance[field] || 0;
      const newValue = oldValue + amount;
      const updateData = {
        [field]: newValue
      };

      console.log(`💰 UPDATING EXISTING RECORD:`);
      console.log(`💰   Old ${field}: ${oldValue}`);
      console.log(`💰   Change: ${amount}`);
      console.log(`💰   New ${field}: ${newValue}`);
      console.log(`💰   Update data:`, JSON.stringify(updateData, null, 2));

      await this.categoryBalancesService.updateByCategoryAndMonth(
        categoryId,
        year,
        month,
        updateData,
        userId,
        authToken
      );
      console.log(`💰 Update complete`);
    } else {
      // Create new balance record
      const balanceData = {
        assigned: 0,
        activity: 0,
        available: 0,
        [field]: amount
      };

      console.log(`💰 CREATING NEW BALANCE RECORD:`);
      console.log(`💰   Balance data:`, JSON.stringify(balanceData, null, 2));

      await this.categoryBalancesService.createOrUpdateByCategoryAndMonth(
        categoryId,
        budgetId,
        year,
        month,
        balanceData,
        userId,
        authToken
      );
      console.log(`💰 Creation complete`);
    }

    console.log(`💰 ========== UPDATE CATEGORY BALANCE END ==========`);
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
