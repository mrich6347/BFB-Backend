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

    // Delete the transaction
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    // Reverse category activity if transaction had a category (but not for ready-to-assign)
    const wasReadyToAssign = transaction.category_id === null;
    if (transaction.category_id && transaction.amount !== 0 && !wasReadyToAssign) {
      const budgetId = await this.getBudgetIdFromAccount(transaction.account_id, userId, authToken);

      if (budgetId) {
        try {
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
          // Don't throw here - transaction was deleted successfully, activity update is secondary
        }
      }
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

  /**
   * Update account balances based on current transactions
   */
  private async updateAccountBalances(accountId: string, userId: string, authToken: string): Promise<void> {
    console.log(`🔄 Updating account balances for account: ${accountId}`);
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // We need to get the initial account balance. The approach is:
    // 1. Get the account when it was first created (this is stored in cleared_balance initially)
    // 2. Calculate the sum of all transactions
    // 3. Update balances accordingly

    // First, let's get the account creation balance by checking if there are any transactions
    // If no transactions exist, the current cleared_balance is the initial balance
    // If transactions exist, we need to reverse-calculate the initial balance

    // Get all transactions for this account
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('amount, is_cleared')
      .eq('account_id', accountId)
      .eq('user_id', userId);

    if (transactionsError) {
      throw new Error(transactionsError.message);
    }

    // Get current account data
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('cleared_balance, uncleared_balance, working_balance')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError) {
      throw new Error(accountError.message);
    }

    // Calculate transaction totals
    let clearedTransactionTotal = 0;
    let unclearedTransactionTotal = 0;

    for (const transaction of transactions) {
      if (transaction.is_cleared) {
        clearedTransactionTotal += transaction.amount;
      } else {
        unclearedTransactionTotal += transaction.amount;
      }
    }

    // Calculate the initial balance by working backwards from current state
    // If this is the first time we're calculating, we assume the current cleared_balance
    // minus any cleared transactions is the initial balance
    let initialBalance: number;

    if (transactions.length === 0) {
      // No transactions, so current cleared_balance is the initial balance
      initialBalance = parseFloat(account.cleared_balance.toString());
    } else {
      // Calculate initial balance: current_cleared_balance - cleared_transactions
      // But only if this looks like it hasn't been properly calculated before
      const currentClearedBalance = parseFloat(account.cleared_balance.toString());
      const currentUnclearedBalance = parseFloat(account.uncleared_balance.toString());

      // If uncleared_balance is 0 and we have uncleared transactions, this account hasn't been updated properly
      if (currentUnclearedBalance === 0 && unclearedTransactionTotal !== 0) {
        // This account needs to be recalculated from scratch
        // Assume the current cleared_balance is the initial balance
        initialBalance = currentClearedBalance;
      } else {
        // Account seems to be properly maintained, calculate initial balance
        initialBalance = currentClearedBalance - clearedTransactionTotal;
      }
    }

    // Now calculate the correct balances
    const newClearedBalance = initialBalance + clearedTransactionTotal;
    const newUnclearedBalance = unclearedTransactionTotal;
    const newWorkingBalance = newClearedBalance + newUnclearedBalance;

    console.log(`💰 Account balance calculation:`, {
      accountId,
      initialBalance,
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
