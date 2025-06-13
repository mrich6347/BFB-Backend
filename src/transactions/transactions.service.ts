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

    const payload = {
      ...createTransactionDto,
      user_id: userId,
      is_cleared: createTransactionDto.is_cleared ?? false,
      is_reconciled: createTransactionDto.is_reconciled ?? false,
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Update category activity if transaction has a category
    if (data.category_id && data.amount !== 0) {
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

    // Update the transaction
    const { data, error } = await supabase
      .from('transactions')
      .update(updateTransactionDto)
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

        // If category changed, reverse activity from old category
        if (categoryChanged && originalTransaction.category_id && originalTransaction.amount !== 0) {
          await this.updateCategoryActivity(
            originalTransaction.category_id,
            budgetId,
            originalTransaction.date,
            -originalTransaction.amount, // Reverse the original amount
            userId,
            authToken
          );
        }

        // If amount changed but category stayed the same, adjust the difference
        if (!categoryChanged && amountChanged && data.category_id && originalTransaction.category_id) {
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

        // If category changed to a new category, add activity to new category
        if (categoryChanged && data.category_id && data.amount !== 0) {
          await this.updateCategoryActivity(
            data.category_id,
            budgetId,
            data.date,
            data.amount,
            userId,
            authToken
          );
        }

        // If date changed but category and amount stayed the same, we need to move the activity
        if (dateChanged && !categoryChanged && !amountChanged && data.category_id && data.amount !== 0) {
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

    // Reverse category activity if transaction had a category
    if (transaction.category_id && transaction.amount !== 0) {
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
  }

  async toggleCleared(id: string, userId: string, authToken: string): Promise<TransactionResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // First get the current transaction
    const { data: currentTransaction, error: fetchError } = await supabase
      .from('transactions')
      .select('is_cleared')
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
   * Handles both inflows (positive amounts) and outflows (negative amounts)
   *
   * Logic:
   * - Activity: Always add the transaction amount (positive for inflows, negative for outflows)
   * - Available: Always add the transaction amount (increases for inflows, decreases for outflows)
   */
  private async updateCategoryActivity(
    categoryId: string,
    budgetId: string,
    transactionDate: string,
    amount: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    // Extract year and month from transaction date
    const date = new Date(transactionDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed

    // Get existing category balance for this month
    const existingBalance = await this.categoryBalancesService.findByCategory(
      categoryId,
      year,
      month,
      userId,
      authToken
    );

    if (existingBalance) {
      // Update existing balance
      // Activity always increases by the amount (tracks all transaction activity)
      const newActivity = (existingBalance.activity || 0) + amount;

      // Available changes in the same direction as the amount:
      // - For outflows (negative amount): available decreases (spending reduces available money)
      // - For inflows (positive amount): available increases (income increases available money)
      const newAvailable = (existingBalance.available || 0) + amount;

      await this.categoryBalancesService.updateByCategoryAndMonth(
        categoryId,
        year,
        month,
        {
          activity: newActivity,
          available: newAvailable
        },
        userId,
        authToken
      );
    } else {
      // Create new balance record with the activity
      await this.categoryBalancesService.createOrUpdateByCategoryAndMonth(
        categoryId,
        budgetId,
        year,
        month,
        {
          activity: amount, // Activity is the transaction amount (positive or negative)
          available: amount // Available changes in same direction as amount
        },
        userId,
        authToken
      );
    }
  }
}
