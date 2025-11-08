import { Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateTransactionDto, UpdateTransactionDto, TransactionResponse, TransactionWithAccountsResponse, TransactionDeleteResponse, TransactionDeleteWithReadyToAssignResponse, TransactionWithReadyToAssignAndCategoryBalanceResponse, TransactionWithAccountsAndReadyToAssignAndCategoryBalanceResponse, BulkDeleteTransactionsResponse } from './dto/transaction.dto';
import { CategoryBalancesService } from '../category-balances/category-balances.service';
import { CategoryReadService } from '../categories/services/read/category-read.service';
import { UserDateContextUtils } from '../../common/interfaces/user-date-context.interface';
import { CreditCardDebtService } from '../credit-card-debt/credit-card-debt.service';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TransactionsService {
  private supabase: SupabaseClient;

  constructor(
    private supabaseService: SupabaseService,
    private categoryBalancesService: CategoryBalancesService,
    private categoryReadService: CategoryReadService,
    private creditCardDebtService: CreditCardDebtService,
    private readyToAssignService: ReadyToAssignService
  ) {
    this.supabase = this.supabaseService.client;
  }

  async create(createTransactionDto: CreateTransactionDto, userId: string, authToken: string): Promise<TransactionWithReadyToAssignAndCategoryBalanceResponse | TransactionWithAccountsAndReadyToAssignAndCategoryBalanceResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Check if this is a transfer transaction
    const isTransfer = this.isTransferPayee(createTransactionDto.payee || '');

    // Handle special "ready-to-assign" category
    const isReadyToAssign = createTransactionDto.category_id === 'ready-to-assign';

    // Track the linked transaction for transfers
    let linkedTransaction: TransactionResponse | undefined = undefined;

    // Generate transfer_id for transfers
    const transferId = isTransfer ? uuidv4() : createTransactionDto.transfer_id;

    // Extract timezone-related fields that shouldn't be stored in database
    const { userDate, userYear, userMonth, ...transactionData } = createTransactionDto;

    const payload = {
      ...transactionData,
      user_id: userId,
      is_cleared: createTransactionDto.is_cleared ?? false,
      is_reconciled: createTransactionDto.is_reconciled ?? false,
      // Store null for ready-to-assign transactions
      category_id: isReadyToAssign ? null : createTransactionDto.category_id,
      // Ensure negative amount for cash outflow in transfers
      amount: isTransfer ? -Math.abs(createTransactionDto.amount) : createTransactionDto.amount,
      transfer_id: transferId,
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Handle transfer creation if this is a transfer transaction
    if (isTransfer) {
      console.log('🔄 TRANSFER TRANSACTION CREATION STARTED');
      console.log('📋 Source Transaction Details:', {
        id: data.id,
        account_id: data.account_id,
        amount: data.amount,
        payee: data.payee,
        date: data.date,
        is_cleared: data.is_cleared,
        transfer_id: data.transfer_id
      });
      
      try {
        const budgetId = await this.getBudgetIdFromAccount(data.account_id, userId, authToken);
        if (!budgetId) {
          throw new Error('Could not determine budget for transfer');
        }

        // Get source account details before transfer
        const sourceAccountBefore = await this.getAccountDetails(data.account_id, userId, authToken);
        console.log('💰 Source Account BEFORE Transfer:', {
          id: sourceAccountBefore.id,
          name: sourceAccountBefore.name,
          account_type: sourceAccountBefore.account_type,
          account_balance: sourceAccountBefore.account_balance,
          cleared_balance: sourceAccountBefore.cleared_balance,
          uncleared_balance: sourceAccountBefore.uncleared_balance,
          working_balance: sourceAccountBefore.working_balance
        });

        // Parse target account name and find the account
        const targetAccountName = this.parseTransferAccountName(data.payee || '');
        const targetAccount = await this.getAccountByName(targetAccountName, budgetId, userId, authToken);

        // Validate that target is a valid transfer account (CASH, TRACKING, or CREDIT)
        if (targetAccount.account_type !== 'TRACKING' && targetAccount.account_type !== 'CASH' && targetAccount.account_type !== 'CREDIT') {
          throw new Error('Transfers are only allowed to cash, tracking, or credit card accounts');
        }

        // Validate category requirement based on account types
        // Category is required only when transferring from CASH to TRACKING (money leaving budget)
        const sourceAccountType = sourceAccountBefore.account_type;
        const targetAccountType = targetAccount.account_type;
        const requiresCategory = sourceAccountType === 'CASH' && targetAccountType === 'TRACKING';

        if (requiresCategory && !data.category_id) {
          throw new Error('Transfer from cash account to tracking account requires a category selection');
        }

        // Get target account details before transfer
        const targetAccountBefore = await this.getAccountDetails(targetAccount.id, userId, authToken);
        console.log('💰 Target Account BEFORE Transfer:', {
          id: targetAccountBefore.id,
          name: targetAccountBefore.name,
          account_type: targetAccountBefore.account_type,
          account_balance: targetAccountBefore.account_balance,
          cleared_balance: targetAccountBefore.cleared_balance,
          uncleared_balance: targetAccountBefore.uncleared_balance,
          working_balance: targetAccountBefore.working_balance
        });
        console.log(`⚠️  IMPORTANT: Starting balance (account_balance) is ${targetAccountBefore.account_balance}. If this doesn't match YNAB, the final balance will be off.`);

        console.log('💸 Transfer Amount Calculation:', {
          sourceTransactionAmount: data.amount,
          absoluteAmount: Math.abs(data.amount),
          willCreateTargetTransactionWith: Math.abs(data.amount)
        });

        // Create the linked transfer transaction and store it for the response
        linkedTransaction = await this.createTransferTransaction(data, targetAccount.id, targetAccountName, userId, authToken);
      } catch (transferError) {
        console.error('Error creating transfer transaction:', transferError);
        // If transfer creation fails, we should delete the source transaction to maintain consistency
        await supabase
          .from('transactions')
          .delete()
          .eq('id', data.id)
          .eq('user_id', userId);

        throw new Error(`Transfer creation failed: ${transferError.message}`);
      }
    }

    // Track payment category ID for credit card transactions
    let paymentCategoryId: string | undefined = undefined;

    // Update category activity if transaction has a category (but not for ready-to-assign)
    if (data.category_id && data.amount !== 0 && !isReadyToAssign) {
      const budgetId = await this.getBudgetIdFromAccount(data.account_id, userId, authToken);

      if (budgetId) {
        try {
          // For credit card transactions, handle YNAB logic BEFORE updating category activity
          // This ensures we check available balance before it's affected by the transaction
          const creditCardResult = await this.creditCardDebtService.handleCreditCardTransaction(
            data.id,
            data.account_id,
            data.category_id,
            data.amount,
            budgetId,
            userId,
            authToken,
            createTransactionDto.userYear,
            createTransactionDto.userMonth,
            this.updateCategoryActivity.bind(this)
          );

          // Store payment category ID if this was a credit card transaction
          if (creditCardResult.paymentCategoryId) {
            paymentCategoryId = creditCardResult.paymentCategoryId;
          }

          // Update category activity for all account types (after credit card logic)
          // Skip activity update for payment categories (they're updated manually)
          const isPaymentCategory = await this.isPaymentCategory(data.category_id, userId, authToken);
          if (!isPaymentCategory) {
            await this.updateCategoryActivity(
              data.category_id,
              budgetId,
              data.date,
              data.amount,
              userId,
              authToken,
              createTransactionDto.userDate,
              createTransactionDto.userYear,
              createTransactionDto.userMonth
            );
          } else {
            console.log(`⏭️ Skipping category activity update for payment category ${data.category_id}`);
          }
        } catch (activityError) {
          console.error('Error updating category activity:', activityError);
          // Don't throw here - transaction was created successfully, activity update is secondary
        }
      }
    }

    // Update account balances after creating transaction (incremental update)
    if (isTransfer) {
      console.log('🔄 Updating Source Account Balances (Incremental)...');
      console.log(`🆕 Source Transaction created, updating account balances for account: ${data.account_id}`);
    } else {
      console.log(`🆕 Transaction created, updating account balances for account: ${data.account_id}`);
    }

    try {
      // Use incremental balance update instead of full recalculation
      await this.addTransactionToBalance(data.account_id, userId, authToken, data.amount, data.is_cleared);

      // For transfers, log source account after balance update
      if (isTransfer) {
        const sourceAccountAfter = await this.getAccountDetails(data.account_id, userId, authToken);
        console.log('💰 Source Account AFTER Transfer:', {
          id: sourceAccountAfter.id,
          name: sourceAccountAfter.name,
          account_balance: sourceAccountAfter.account_balance,
          cleared_balance: sourceAccountAfter.cleared_balance,
          uncleared_balance: sourceAccountAfter.uncleared_balance,
          working_balance: sourceAccountAfter.working_balance
        });
        console.log('✅ TRANSFER TRANSACTION CREATION COMPLETED');
      }
    } catch (balanceError) {
      console.error('❌ Error updating account balances:', balanceError);
      // Don't throw here - transaction was created successfully, balance update is secondary
    }

    // Get budget ID for calculating ready to assign
    const budgetId = await this.getBudgetIdFromAccount(data.account_id, userId, authToken);
    let readyToAssign = 0;

    if (budgetId) {
      try {
        readyToAssign = await this.readyToAssignService.calculateReadyToAssign(budgetId, userId, authToken);
      } catch (error) {
        console.error('Error calculating ready to assign:', error);
        // Continue with readyToAssign = 0
      }
    }

    // Get the affected category balance(s) if transaction has a category
    let categoryBalances: any[] = [];
    if (data.category_id && budgetId) {
      try {
        // Get current user date context for determining which month's balance to fetch
        const { year: currentYear, month: currentMonth } = UserDateContextUtils.getCurrentUserDate({
          userYear: createTransactionDto.userYear,
          userMonth: createTransactionDto.userMonth,
          userDate: createTransactionDto.userDate
        });

        // Fetch spending category balance
        const spendingBalance = await this.categoryBalancesService.findByCategory(
          data.category_id,
          currentYear,
          currentMonth,
          userId,
          authToken
        );
        
        if (spendingBalance) {
          categoryBalances.push(spendingBalance);
        }

        // If this was a credit card transaction, also fetch payment category balance
        if (paymentCategoryId) {
          const paymentBalance = await this.categoryBalancesService.findByCategory(
            paymentCategoryId,
            currentYear,
            currentMonth,
            userId,
            authToken
          );
          
          if (paymentBalance) {
            categoryBalances.push(paymentBalance);
          }
        }
      } catch (error) {
        console.error('Error fetching category balances:', error);
        // Continue with empty categoryBalances array
      }
    }

    // For transfer transactions, return both account balances and linked transaction
    if (isTransfer) {
      try {
        if (budgetId) {
          const targetAccountName = this.parseTransferAccountName(data.payee || '');
          const targetAccount = await this.getAccountByName(targetAccountName, budgetId, userId, authToken);

          const sourceAccountDetails = await this.getAccountDetails(data.account_id, userId, authToken);
          const targetAccountDetails = await this.getAccountDetails(targetAccount.id, userId, authToken);

          return {
            transaction: data,
            linkedTransaction: linkedTransaction, // Include the linked transaction for optimistic updates
            sourceAccount: sourceAccountDetails,
            targetAccount: targetAccountDetails,
            readyToAssign,
            categoryBalance: categoryBalances.length > 0 ? categoryBalances[0] : undefined, // Keep backward compat
            categoryBalances: categoryBalances.length > 0 ? categoryBalances : undefined
          };
        }
      } catch (accountError) {
        console.error('Error getting account details for transfer response:', accountError);
        // Fall back to regular response
      }
    }

    return {
      transaction: data,
      readyToAssign,
      categoryBalance: categoryBalances.length > 0 ? categoryBalances[0] : undefined, // Keep backward compat
      categoryBalances: categoryBalances.length > 0 ? categoryBalances : undefined
    };
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

  async update(id: string, updateTransactionDto: UpdateTransactionDto, userId: string, authToken: string): Promise<TransactionWithReadyToAssignAndCategoryBalanceResponse | TransactionWithAccountsAndReadyToAssignAndCategoryBalanceResponse> {
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

    // Extract timezone-related fields that shouldn't be stored in database
    const { userDate, userYear, userMonth, ...updateData } = updateTransactionDto;

    // Prepare update payload
    const updatePayload = {
      ...updateData,
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

    // Handle transfer synchronization if this is a transfer transaction
    if (originalTransaction.transfer_id) {
      try {
        await this.updateLinkedTransferTransaction(originalTransaction, data, userId, authToken);
      } catch (transferError) {
        console.error('Error updating linked transfer transaction:', transferError);
        // Don't throw here - the main transaction was updated successfully
      }
    }

    // Handle category activity updates if relevant fields changed
    const budgetId = await this.getBudgetIdFromAccount(data.account_id, userId, authToken);

    if (budgetId) {
      try {
        // Check if category changed
        const categoryChanged = originalTransaction.category_id !== data.category_id;
        const amountChanged = originalTransaction.amount !== data.amount;
        const dateChanged = originalTransaction.date !== data.date;

        // Handle credit card logic for updates FIRST (before category activity updates)
        if (amountChanged || categoryChanged) {
          await this.creditCardDebtService.handleCreditCardTransactionUpdate(
            id,
            data.account_id,
            originalTransaction,
            data,
            budgetId,
            userId,
            authToken,
            updateTransactionDto.userYear,
            updateTransactionDto.userMonth,
            this.updateCategoryActivity.bind(this),
            this.categoryReadService.getCategoryBalance.bind(this.categoryReadService)
          );
        }

        // If category changed, reverse activity from old category (but not if it was ready-to-assign)
        if (categoryChanged && originalTransaction.category_id && originalTransaction.amount !== 0 && !wasReadyToAssign) {
          await this.updateCategoryActivity(
            originalTransaction.category_id,
            budgetId,
            originalTransaction.date,
            -originalTransaction.amount, // Reverse the original amount
            userId,
            authToken,
            updateTransactionDto.userDate,
            updateTransactionDto.userYear,
            updateTransactionDto.userMonth
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
            authToken,
            updateTransactionDto.userDate,
            updateTransactionDto.userYear,
            updateTransactionDto.userMonth
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
            authToken,
            updateTransactionDto.userDate,
            updateTransactionDto.userYear,
            updateTransactionDto.userMonth
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
            authToken,
            updateTransactionDto.userDate,
            updateTransactionDto.userYear,
            updateTransactionDto.userMonth
          );

          // Add to new date
          await this.updateCategoryActivity(
            data.category_id,
            budgetId,
            data.date,
            data.amount,
            userId,
            authToken,
            updateTransactionDto.userDate,
            updateTransactionDto.userYear,
            updateTransactionDto.userMonth
          );
        }
      } catch (activityError) {
        console.error('Error updating category activity:', activityError);
        // Don't throw here - transaction was updated successfully, activity update is secondary
      }
    }

    // Update account balances after updating transaction (incremental update)
    try {
      // If account changed, we need to remove from old account and add to new account
      if (originalTransaction.account_id !== data.account_id) {
        // Remove from old account
        await this.removeTransactionFromBalance(
          originalTransaction.account_id,
          userId,
          authToken,
          originalTransaction.amount,
          originalTransaction.is_cleared
        );
        // Add to new account
        await this.addTransactionToBalance(
          data.account_id,
          userId,
          authToken,
          data.amount,
          data.is_cleared
        );
      } else {
        // Same account - remove old values and add new values
        // This handles changes in amount and/or cleared status
        await this.removeTransactionFromBalance(
          originalTransaction.account_id,
          userId,
          authToken,
          originalTransaction.amount,
          originalTransaction.is_cleared
        );
        await this.addTransactionToBalance(
          data.account_id,
          userId,
          authToken,
          data.amount,
          data.is_cleared
        );
      }
    } catch (balanceError) {
      console.error('Error updating account balances:', balanceError);
      // Don't throw here - transaction was updated successfully, balance update is secondary
    }

    // Calculate ready to assign using the existing budgetId
    let readyToAssign = 0;

    if (budgetId) {
      try {
        readyToAssign = await this.readyToAssignService.calculateReadyToAssign(budgetId, userId, authToken);
      } catch (error) {
        console.error('Error calculating ready to assign:', error);
        // Continue with readyToAssign = 0
      }
    }

    // Get the affected category balance if transaction has a category
    let categoryBalance: any = null;
    if (data.category_id && budgetId) {
      try {
        // Get current user date context for determining which month's balance to fetch
        const { year: currentYear, month: currentMonth } = UserDateContextUtils.getCurrentUserDate({
          userYear: updateTransactionDto.userYear,
          userMonth: updateTransactionDto.userMonth,
          userDate: updateTransactionDto.userDate
        });

        categoryBalance = await this.categoryBalancesService.findByCategory(
          data.category_id,
          currentYear,
          currentMonth,
          userId,
          authToken
        );
      } catch (error) {
        console.error('Error fetching category balance:', error);
        // Continue with categoryBalance = null
      }
    }

    // For transfer transactions, return both account balances
    if (data.transfer_id) {
      try {
        const supabase = this.supabaseService.getAuthenticatedClient(authToken);

        // Get both the linked transaction and account details in parallel for better performance
        const [linkedTransactionResult, sourceAccountResult] = await Promise.all([
          supabase
            .from('transactions')
            .select('account_id')
            .eq('transfer_id', data.transfer_id)
            .eq('user_id', userId)
            .neq('id', data.id)
            .single(),
          this.getAccountDetails(data.account_id, userId, authToken)
        ]);

        if (linkedTransactionResult.data && !linkedTransactionResult.error) {
          const targetAccountDetails = await this.getAccountDetails(linkedTransactionResult.data.account_id, userId, authToken);

          return {
            transaction: data,
            sourceAccount: sourceAccountResult,
            targetAccount: targetAccountDetails,
            readyToAssign,
            categoryBalance
          };
        }
      } catch (accountError) {
        console.error('Error getting account details for transfer update response:', accountError);
        // Fall back to regular response
      }
    }

    return {
      transaction: data,
      readyToAssign,
      categoryBalance
    };
  }

  async remove(id: string, userId: string, authToken: string): Promise<TransactionDeleteWithReadyToAssignResponse> {
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

    // Store transfer info before deletion for account balance response
    let linkedAccountId: string | undefined;
    let linkedTransactionCategoryId: string | null = null;
    let linkedTransactionAmount: number | undefined;
    if (transaction.transfer_id) {
      try {
        // Get the linked transaction details before deleting
        const { data: linkedTransaction } = await supabase
          .from('transactions')
          .select('account_id, category_id, amount')
          .eq('transfer_id', transaction.transfer_id)
          .eq('user_id', userId)
          .neq('id', transaction.id)
          .single();

        if (linkedTransaction) {
          linkedAccountId = linkedTransaction.account_id;
          linkedTransactionCategoryId = linkedTransaction.category_id;
          linkedTransactionAmount = linkedTransaction.amount;
        }

        await this.deleteLinkedTransferTransaction(transaction.transfer_id, id, userId, authToken);
      } catch (transferError) {
        console.error('Error deleting linked transfer transaction:', transferError);
        // Don't throw here - we still want to delete the main transaction
      }
    }

    // Reverse category activity before deleting transaction
    const wasReadyToAssign = transaction.category_id === null;

    // Check if this transaction or its linked transaction has a payment category
    const categoryToCheck = transaction.category_id || linkedTransactionCategoryId;

    // Process category reversal if:
    // 1. This transaction has a category (not ready-to-assign), OR
    // 2. The linked transaction has a category (for transfer payments)
    if (categoryToCheck && transaction.amount !== 0) {
      const budgetId = await this.getBudgetIdFromAccount(transaction.account_id, userId, authToken);

      if (budgetId) {
        try {
          // Handle credit card transaction deletion FIRST
          await this.creditCardDebtService.handleCreditCardTransactionDeletion(
            transaction.id,
            transaction.account_id,
            transaction,
            budgetId,
            userId,
            authToken,
            this.updateCategoryActivity.bind(this)
          );

          // Check if the category (from this transaction or linked transaction) is a payment category
          const isPaymentCategory = await this.isPaymentCategory(categoryToCheck, userId, authToken);

          if (!isPaymentCategory && transaction.category_id) {
            // For regular categories, do the normal category activity reversal
            await this.updateCategoryActivity(
              transaction.category_id,
              budgetId,
              transaction.date,
              -transaction.amount, // Reverse the amount
              userId,
              authToken
            );
          } else if (isPaymentCategory) {
            // For payment categories, manually add back to available
            // If this transaction has the category, use its amount (negative, from cash account)
            // If the linked transaction has the category, use its amount (negative, from cash account)
            // We need to add back the absolute value to the payment category
            const amountToUse = transaction.category_id ? transaction.amount : (linkedTransactionAmount || 0);
            const amountToAddBack = Math.abs(amountToUse);
            console.log(`⏭️ Skipping category activity reversal for payment category ${categoryToCheck}`);
            console.log(`💳 Manually adding back $${amountToAddBack} to payment category available (from ${transaction.category_id ? 'current' : 'linked'} transaction)`);

            const supabase = this.supabaseService.getAuthenticatedClient(authToken);
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;

            const { data: paymentBalance } = await supabase
              .from('category_balances')
              .select('available')
              .eq('category_id', categoryToCheck)
              .eq('user_id', userId)
              .eq('year', currentYear)
              .eq('month', currentMonth)
              .single();

            if (paymentBalance) {
              // Add back to payment category available (reverse the payment)
              await supabase
                .from('category_balances')
                .update({
                  available: (paymentBalance.available || 0) + amountToAddBack
                })
                .eq('category_id', categoryToCheck)
                .eq('user_id', userId)
                .eq('year', currentYear)
                .eq('month', currentMonth);
            }
          }
        } catch (activityError) {
          console.error('Error reversing category activity:', activityError);
          // Don't throw here - we still want to delete the transaction
        }
      }
    }

    // Now delete the transaction
    console.log(`🗑️ Deleting transaction with ID: ${id} for user: ${userId}`);
    const { data: deleteResult, error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('*');

    if (error) {
      console.error(`❌ Error deleting transaction:`, error);
      throw new Error(error.message);
    }

    console.log(`✅ Transaction deleted successfully:`, JSON.stringify(deleteResult, null, 2));

    // Update account balances after deleting transaction (incremental update)
    try {
      // Use incremental balance update instead of full recalculation
      await this.removeTransactionFromBalance(transaction.account_id, userId, authToken, transaction.amount, transaction.is_cleared);
    } catch (balanceError) {
      console.error('Error updating account balances:', balanceError);
      // Don't throw here - transaction was deleted successfully, balance update is secondary
    }

    // Calculate ready to assign after transaction deletion
    const budgetId = await this.getBudgetIdFromAccount(transaction.account_id, userId, authToken);
    let readyToAssign = 0;

    if (budgetId) {
      try {
        readyToAssign = await this.readyToAssignService.calculateReadyToAssign(budgetId, userId, authToken);
      } catch (error) {
        console.error('Error calculating ready to assign:', error);
        // Continue with readyToAssign = 0
      }
    }

    // For transfer transactions, return both account balances
    if (transaction.transfer_id && linkedAccountId) {
      try {
        // Get both account details in parallel for better performance
        const [sourceAccountDetails, targetAccountDetails] = await Promise.all([
          this.getAccountDetails(transaction.account_id, userId, authToken),
          this.getAccountDetails(linkedAccountId, userId, authToken)
        ]);

        return {
          sourceAccount: sourceAccountDetails,
          targetAccount: targetAccountDetails,
          readyToAssign
        };
      } catch (accountError) {
        console.error('Error getting account details for transfer delete response:', accountError);
        // Fall back to basic response
      }
    }

    // For non-transfer transactions, return basic response
    return {
      readyToAssign
    };
  }

  /**
   * Bulk delete multiple transactions efficiently
   * This method batches balance updates per account for better performance
   */
  async bulkRemove(transactionIds: string[], userId: string, authToken: string): Promise<BulkDeleteTransactionsResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    if (!transactionIds || transactionIds.length === 0) {
      throw new Error('No transaction IDs provided');
    }

    console.log(`🗑️ Bulk deleting ${transactionIds.length} transactions for user: ${userId}`);

    // Fetch all transactions to be deleted
    const { data: transactions, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .in('id', transactionIds)
      .eq('user_id', userId);

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (!transactions || transactions.length === 0) {
      throw new Error('No transactions found to delete');
    }

    console.log(`📋 Found ${transactions.length} transactions to delete`);

    // Group transactions by account for efficient balance updates
    const transactionsByAccount = new Map<string, any[]>();
    const transferTransactionIds = new Set<string>();
    const linkedAccountIds = new Set<string>();

    for (const transaction of transactions) {
      if (!transactionsByAccount.has(transaction.account_id)) {
        transactionsByAccount.set(transaction.account_id, []);
      }
      transactionsByAccount.get(transaction.account_id)!.push(transaction);

      // Track transfer transactions
      if (transaction.transfer_id) {
        transferTransactionIds.add(transaction.transfer_id);
      }
    }

    // Find and delete linked transfer transactions
    if (transferTransactionIds.size > 0) {
      const { data: linkedTransactions } = await supabase
        .from('transactions')
        .select('*')
        .in('transfer_id', Array.from(transferTransactionIds))
        .eq('user_id', userId)
        .not('id', 'in', `(${transactionIds.join(',')})`);

      if (linkedTransactions && linkedTransactions.length > 0) {
        console.log(`🔗 Found ${linkedTransactions.length} linked transfer transactions to delete`);

        // Group linked transactions by account
        for (const linkedTx of linkedTransactions) {
          if (!transactionsByAccount.has(linkedTx.account_id)) {
            transactionsByAccount.set(linkedTx.account_id, []);
          }
          transactionsByAccount.get(linkedTx.account_id)!.push(linkedTx);
          linkedAccountIds.add(linkedTx.account_id);
          transactionIds.push(linkedTx.id); // Add to deletion list
        }
      }
    }

    // Reverse category activity for all transactions
    const budgetIds = new Set<string>();
    for (const transaction of transactions) {
      const wasReadyToAssign = transaction.category_id === null;
      if (transaction.category_id && transaction.amount !== 0 && !wasReadyToAssign) {
        const budgetId = await this.getBudgetIdFromAccount(transaction.account_id, userId, authToken);
        if (budgetId) {
          budgetIds.add(budgetId);
          try {
            await this.creditCardDebtService.handleCreditCardTransactionDeletion(
              transaction.id,
              transaction.account_id,
              transaction,
              budgetId,
              userId,
              authToken,
              this.updateCategoryActivity.bind(this)
            );

            await this.updateCategoryActivity(
              transaction.category_id,
              budgetId,
              transaction.date,
              -transaction.amount,
              userId,
              authToken
            );
          } catch (activityError) {
            console.error('Error reversing category activity:', activityError);
          }
        }
      }
    }

    // Delete all transactions in one query
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .in('id', transactionIds)
      .eq('user_id', userId);

    if (deleteError) {
      console.error(`❌ Error bulk deleting transactions:`, deleteError);
      throw new Error(deleteError.message);
    }

    console.log(`✅ Successfully deleted ${transactionIds.length} transactions`);

    // Update balances for each affected account (batched by account)
    const affectedAccountIds = Array.from(transactionsByAccount.keys());
    console.log(`🔄 Updating balances for ${affectedAccountIds.length} affected accounts`);

    for (const [accountId, accountTransactions] of transactionsByAccount.entries()) {
      try {
        // Calculate total balance change for this account
        let clearedDelta = 0;
        let unclearedDelta = 0;

        for (const tx of accountTransactions) {
          if (tx.is_cleared) {
            clearedDelta -= tx.amount;
          } else {
            unclearedDelta -= tx.amount;
          }
        }

        // Apply the batched balance update
        if (clearedDelta !== 0 || unclearedDelta !== 0) {
          const { data: account, error: accountError } = await supabase
            .from('accounts')
            .select('cleared_balance, uncleared_balance')
            .eq('id', accountId)
            .eq('user_id', userId)
            .single();

          if (accountError) {
            console.error(`Error fetching account ${accountId}:`, accountError);
            continue;
          }

          const currentCleared = this.toNumber(account.cleared_balance);
          const currentUncleared = this.toNumber(account.uncleared_balance);

          const nextCleared = this.roundToTwoDecimals(currentCleared + clearedDelta);
          const nextUncleared = this.roundToTwoDecimals(currentUncleared + unclearedDelta);
          const nextWorking = this.roundToTwoDecimals(nextCleared + nextUncleared);

          await supabase
            .from('accounts')
            .update({
              cleared_balance: nextCleared,
              uncleared_balance: nextUncleared,
              working_balance: nextWorking
            })
            .eq('id', accountId)
            .eq('user_id', userId);

          console.log(`✅ Updated account ${accountId}: clearedDelta=${clearedDelta}, unclearedDelta=${unclearedDelta}`);
        }
      } catch (balanceError) {
        console.error(`Error updating balances for account ${accountId}:`, balanceError);
      }
    }

    // Get updated account details for all affected accounts
    const affectedAccounts: any[] = [];
    for (const accountId of affectedAccountIds) {
      try {
        const accountDetails = await this.getAccountDetails(accountId, userId, authToken);
        affectedAccounts.push(accountDetails);
      } catch (error) {
        console.error(`Error fetching account details for ${accountId}:`, error);
      }
    }

    // Calculate ready to assign (use first budget ID found)
    let readyToAssign = 0;
    const budgetId = budgetIds.values().next().value || await this.getBudgetIdFromAccount(affectedAccountIds[0], userId, authToken);
    if (budgetId) {
      try {
        readyToAssign = await this.readyToAssignService.calculateReadyToAssign(budgetId, userId, authToken);
      } catch (error) {
        console.error('Error calculating ready to assign:', error);
      }
    }

    return {
      deletedCount: transactions.length,
      affectedAccounts,
      readyToAssign
    };
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

    const newClearedStatus = !currentTransaction.is_cleared;

    // Toggle the cleared status
    const { data, error } = await supabase
      .from('transactions')
      .update({ is_cleared: newClearedStatus })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Update account balances after toggling cleared status
    try {
      await this.adjustAccountBalancesForClearedToggle(
        supabase,
        data.account_id,
        userId,
        data.amount,
        currentTransaction.is_cleared,
        data.is_cleared
      );
    } catch (balanceError) {
      console.error('Error updating account balances:', balanceError);
      // Don't throw here - transaction was updated successfully, balance update is secondary
    }

    return data;
  }

  private async adjustAccountBalancesForClearedToggle(
    supabase: SupabaseClient,
    accountId: string,
    userId: string,
    amount: number,
    wasCleared: boolean,
    isCleared: boolean
  ): Promise<void> {
    if (wasCleared === isCleared) {
      return;
    }

    const amountValue = this.toNumber(amount);

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('cleared_balance, uncleared_balance')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError) {
      throw new Error(accountError.message);
    }

    const currentCleared = this.toNumber(account.cleared_balance);
    const currentUncleared = this.toNumber(account.uncleared_balance);

    const clearedDelta = isCleared ? amountValue : -amountValue;
    const unclearedDelta = isCleared ? -amountValue : amountValue;

    const nextCleared = this.roundToTwoDecimals(currentCleared + clearedDelta);
    const nextUncleared = this.roundToTwoDecimals(currentUncleared + unclearedDelta);
    const nextWorking = this.roundToTwoDecimals(nextCleared + nextUncleared);

    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        cleared_balance: nextCleared,
        uncleared_balance: nextUncleared,
        working_balance: nextWorking
      })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Incrementally add a transaction amount to account balances
   * This is much more efficient than recalculating from all transactions
   * @param accountId - The account to update
   * @param userId - The user ID
   * @param authToken - The auth token
   * @param amount - The transaction amount to add
   * @param isCleared - Whether the transaction is cleared
   */
  private async addTransactionToBalance(
    accountId: string,
    userId: string,
    authToken: string,
    amount: number,
    isCleared: boolean
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    const amountValue = this.toNumber(amount);

    // Get current balances
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('cleared_balance, uncleared_balance')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError) {
      throw new Error(accountError.message);
    }

    const currentCleared = this.toNumber(account.cleared_balance);
    const currentUncleared = this.toNumber(account.uncleared_balance);

    // Add amount to appropriate balance
    const nextCleared = isCleared
      ? this.roundToTwoDecimals(currentCleared + amountValue)
      : currentCleared;
    const nextUncleared = !isCleared
      ? this.roundToTwoDecimals(currentUncleared + amountValue)
      : currentUncleared;
    const nextWorking = this.roundToTwoDecimals(nextCleared + nextUncleared);

    // Update the account
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        cleared_balance: nextCleared,
        uncleared_balance: nextUncleared,
        working_balance: nextWorking
      })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    console.log(`✅ Incrementally added transaction to balance: account=${accountId}, amount=${amountValue}, isCleared=${isCleared}, newCleared=${nextCleared}, newUncleared=${nextUncleared}, newWorking=${nextWorking}`);
  }

  /**
   * Incrementally remove a transaction amount from account balances
   * This is much more efficient than recalculating from all transactions
   * @param accountId - The account to update
   * @param userId - The user ID
   * @param authToken - The auth token
   * @param amount - The transaction amount to remove
   * @param isCleared - Whether the transaction is cleared
   */
  private async removeTransactionFromBalance(
    accountId: string,
    userId: string,
    authToken: string,
    amount: number,
    isCleared: boolean
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    const amountValue = this.toNumber(amount);

    // Get current balances
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('cleared_balance, uncleared_balance')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError) {
      throw new Error(accountError.message);
    }

    const currentCleared = this.toNumber(account.cleared_balance);
    const currentUncleared = this.toNumber(account.uncleared_balance);

    // Remove amount from appropriate balance
    const nextCleared = isCleared
      ? this.roundToTwoDecimals(currentCleared - amountValue)
      : currentCleared;
    const nextUncleared = !isCleared
      ? this.roundToTwoDecimals(currentUncleared - amountValue)
      : currentUncleared;
    const nextWorking = this.roundToTwoDecimals(nextCleared + nextUncleared);

    // Update the account
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        cleared_balance: nextCleared,
        uncleared_balance: nextUncleared,
        working_balance: nextWorking
      })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    console.log(`✅ Incrementally removed transaction from balance: account=${accountId}, amount=${amountValue}, isCleared=${isCleared}, newCleared=${nextCleared}, newUncleared=${nextUncleared}, newWorking=${nextWorking}`);
  }

  private toNumber(value: number | string | null): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'number') {
      return value;
    }

    const parsed = parseFloat(value);

    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid numeric value: ${value}`);
    }

    return parsed;
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
    authToken: string,
    userCurrentDate?: string,
    userCurrentYear?: number,
    userCurrentMonth?: number
  ): Promise<void> {
    // Validate transaction date - no future transactions allowed
    if (!UserDateContextUtils.validateTransactionDate(transactionDate, userCurrentDate)) {
      throw new Error('Future transactions are not allowed');
    }

    // Extract year and month from transaction date for activity tracking
    const { year: transactionYear, month: transactionMonth } = UserDateContextUtils.getYearMonthFromDate(transactionDate);

    // Get current year and month for available balance updates (use user context if provided)
    const { year: currentYear, month: currentMonth } = UserDateContextUtils.getCurrentUserDate({
      userYear: userCurrentYear,
      userMonth: userCurrentMonth,
      userDate: userCurrentDate
    });

    // Update activity for the transaction's actual month
    await this.updateActivityForMonth(
      categoryId,
      budgetId,
      transactionYear,
      transactionMonth,
      amount,
      userId,
      authToken,
      currentYear,
      currentMonth
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
    authToken: string,
    currentYear: number,
    currentMonth: number
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
   * Update account balances based on current transactions (FULL RECALCULATION)
   *
   * NOTE: This method is kept for reconciliation and data integrity checks.
   * For normal transaction operations (create/update/delete), use the incremental
   * methods (addTransactionToBalance, removeTransactionFromBalance) instead.
   *
   * Logic:
   * - Cleared Balance = Account Balance (starting balance) + Sum of Cleared Transactions
   * - Uncleared Balance = Sum of Uncleared Transactions
   * - Working Balance = Cleared Balance + Uncleared Balance
   */
  async updateAccountBalances(accountId: string, userId: string, authToken: string): Promise<void> {
    console.log(`🔄 Updating account balances for account: ${accountId}`);
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get all transactions for this account
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('id, amount, is_cleared, payee, transfer_id')
      .eq('account_id', accountId)
      .eq('user_id', userId);

    if (transactionsError) {
      throw new Error(transactionsError.message);
    }

    // Get current account to get the account_balance (starting balance)
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('account_balance, name')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError) {
      throw new Error(accountError.message);
    }

    console.log(`📋 Account: ${account.name} (${accountId})`);
    console.log(`📋 Starting account_balance: ${account.account_balance}`);
    console.log(`⚠️  NOTE: If your balance doesn't match YNAB, check if account_balance is correct. This is the starting balance used in all calculations.`);
    console.log(`📋 Total transactions to process: ${transactions.length}`);

    // Calculate transaction totals
    let clearedTransactionTotal = 0;
    let unclearedTransactionTotal = 0;

    console.log(`🔍 Processing ${transactions.length} transactions for account ${accountId}:`);
    transactions.forEach((transaction, index) => {
      const amount = parseFloat(transaction.amount.toString());
      const isTransfer = transaction.transfer_id ? `(Transfer ID: ${transaction.transfer_id})` : '';
      console.log(`  [${index + 1}] Transaction ID: ${transaction.id}, Payee: ${transaction.payee}, Amount: ${amount}, is_cleared: ${transaction.is_cleared} ${isTransfer}`);
      if (transaction.is_cleared) {
        clearedTransactionTotal += amount;
      } else {
        unclearedTransactionTotal += amount;
      }
    });
    
    console.log(`📊 Transaction totals: cleared=${clearedTransactionTotal.toFixed(2)}, uncleared=${unclearedTransactionTotal.toFixed(2)}`);

    // Get the starting balance from the account_balance field
    const accountBalance = parseFloat(account.account_balance.toString());

    // Calculate the correct balances using the simple, clear formula
    // Round to 2 decimal places to avoid floating point precision errors
    const newClearedBalance = Math.round((accountBalance + clearedTransactionTotal) * 100) / 100;
    const newUnclearedBalance = Math.round(unclearedTransactionTotal * 100) / 100;
    const newWorkingBalance = Math.round((newClearedBalance + newUnclearedBalance) * 100) / 100;

    console.log(`💰 Account balance calculation for ${account.name}:`, {
      accountId,
      accountBalance: accountBalance.toFixed(2),
      clearedTransactionTotal: clearedTransactionTotal.toFixed(2),
      unclearedTransactionTotal: unclearedTransactionTotal.toFixed(2),
      calculation: `${accountBalance.toFixed(2)} + ${clearedTransactionTotal.toFixed(2)} = ${newClearedBalance.toFixed(2)}`,
      newClearedBalance: newClearedBalance.toFixed(2),
      newUnclearedBalance: newUnclearedBalance.toFixed(2),
      newWorkingBalance: newWorkingBalance.toFixed(2),
      note: 'All balances rounded to 2 decimal places to prevent floating point precision errors'
    });

    // Update the account with new balances (rounded to 2 decimal places)
    const { data: updateResult, error: updateError } = await supabase
      .from('accounts')
      .update({
        cleared_balance: newClearedBalance,
        uncleared_balance: newUnclearedBalance,
        working_balance: newWorkingBalance
      })
      .eq('id', accountId)
      .eq('user_id', userId)
      .select('*');

    if (updateError) {
      console.error(`❌ Error updating account balances:`, updateError);
      throw new Error(updateError.message);
    }

    console.log(`✅ Successfully updated account balances for account: ${accountId}`);
    console.log(`📊 Updated account data:`, JSON.stringify(updateResult, null, 2));
  }

  /**
   * Transfer-related helper methods
   */
  private static readonly TRANSFER_PREFIX = 'Transfer : ';

  private isTransferPayee(payee: string): boolean {
    return payee?.startsWith(TransactionsService.TRANSFER_PREFIX) || false;
  }

  private parseTransferAccountName(payee: string): string {
    if (!this.isTransferPayee(payee)) {
      throw new Error('Invalid transfer payee format');
    }
    return payee.substring(TransactionsService.TRANSFER_PREFIX.length);
  }

  private async getAccountByName(accountName: string, budgetId: string, userId: string, authToken: string): Promise<any> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('budget_id', budgetId)
      .eq('name', accountName)
      .eq('is_active', true)
      .single();

    if (error) {
      throw new Error(`Account '${accountName}' not found: ${error.message}`);
    }

    return data;
  }

  private async createTransferTransaction(
    sourceTransaction: TransactionResponse,
    targetAccountId: string,
    targetAccountName: string,
    userId: string,
    authToken: string
  ): Promise<TransactionResponse> {
    console.log('📤 Creating Transfer Transaction (Target Side)');
    console.log('📋 Source Transaction:', {
      id: sourceTransaction.id,
      account_id: sourceTransaction.account_id,
      amount: sourceTransaction.amount,
      transfer_id: sourceTransaction.transfer_id
    });

    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get source account name for the target transaction payee
    const sourceAccount = await supabase
      .from('accounts')
      .select('name')
      .eq('id', sourceTransaction.account_id)
      .eq('user_id', userId)
      .single();

    if (sourceAccount.error) {
      throw new Error(`Failed to get source account name: ${sourceAccount.error.message}`);
    }

    // Calculate target transaction amount
    const targetAmount = Math.abs(sourceTransaction.amount);
    console.log('💵 Target Transaction Amount Calculation:', {
      sourceAmount: sourceTransaction.amount,
      absoluteValue: Math.abs(sourceTransaction.amount),
      targetAmount: targetAmount
    });

    // Create the target transaction
    const targetTransactionPayload = {
      user_id: userId,
      account_id: targetAccountId,
      date: sourceTransaction.date,
      amount: targetAmount, // Positive amount for inflow
      payee: `${TransactionsService.TRANSFER_PREFIX}${sourceAccount.data.name}`,
      memo: sourceTransaction.memo,
      category_id: null, // Tracking accounts don't use categories
      is_cleared: sourceTransaction.is_cleared,
      is_reconciled: false,
      transfer_id: sourceTransaction.transfer_id
    };

    console.log('📝 Target Transaction Payload:', {
      account_id: targetAccountId,
      amount: targetTransactionPayload.amount,
      date: targetTransactionPayload.date,
      is_cleared: targetTransactionPayload.is_cleared,
      transfer_id: targetTransactionPayload.transfer_id
    });

    const { data, error } = await supabase
      .from('transactions')
      .insert(targetTransactionPayload)
      .select('*')
      .single();

    if (error) {
      console.error('❌ Failed to create target transaction:', error);
      throw new Error(`Failed to create transfer transaction: ${error.message}`);
    }

    console.log('✅ Target Transaction Created:', {
      id: data.id,
      account_id: data.account_id,
      amount: data.amount,
      transfer_id: data.transfer_id
    });

    // Update target account balances (incremental update)
    console.log('🔄 Updating Target Account Balances (Incremental)...');
    try {
      // Use incremental balance update instead of full recalculation
      await this.addTransactionToBalance(targetAccountId, userId, authToken, data.amount, data.is_cleared);

      // Get target account details after balance update
      const targetAccountAfter = await this.getAccountDetails(targetAccountId, userId, authToken);
      console.log('💰 Target Account AFTER Transfer:', {
        id: targetAccountAfter.id,
        name: targetAccountAfter.name,
        account_balance: targetAccountAfter.account_balance,
        cleared_balance: targetAccountAfter.cleared_balance,
        uncleared_balance: targetAccountAfter.uncleared_balance,
        working_balance: targetAccountAfter.working_balance
      });
    } catch (balanceError) {
      console.error('❌ Error updating target account balances:', balanceError);
      throw balanceError;
    }

    return data;
  }

  private async updateLinkedTransferTransaction(
    originalTransaction: TransactionResponse,
    updatedTransaction: TransactionResponse,
    userId: string,
    authToken: string
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // First, get the current linked transaction to know its current state
    const { data: currentLinkedTransaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transfer_id', originalTransaction.transfer_id)
      .eq('user_id', userId)
      .neq('id', originalTransaction.id)
      .single();

    if (fetchError || !currentLinkedTransaction) {
      console.error('Linked transfer transaction not found:', fetchError);
      return;
    }

    // Build the update payload for the linked transaction
    const linkedUpdatePayload: any = {};

    // Update date if changed
    if (originalTransaction.date !== updatedTransaction.date) {
      linkedUpdatePayload.date = updatedTransaction.date;
    }

    // Update amount if changed (opposite sign)
    if (originalTransaction.amount !== updatedTransaction.amount) {
      linkedUpdatePayload.amount = -updatedTransaction.amount;
    }

    // Update memo if changed
    if (originalTransaction.memo !== updatedTransaction.memo) {
      linkedUpdatePayload.memo = updatedTransaction.memo;
    }

    // Update cleared status if changed
    if (originalTransaction.is_cleared !== updatedTransaction.is_cleared) {
      linkedUpdatePayload.is_cleared = updatedTransaction.is_cleared;
    }

    // Only proceed if there are changes
    if (Object.keys(linkedUpdatePayload).length === 0) {
      return;
    }

    // Update the linked transaction
    const { error: updateError } = await supabase
      .from('transactions')
      .update(linkedUpdatePayload)
      .eq('transfer_id', originalTransaction.transfer_id)
      .eq('user_id', userId)
      .neq('id', originalTransaction.id);

    if (updateError) {
      throw new Error(`Failed to update linked transfer transaction: ${updateError.message}`);
    }

    // Update account balances for the linked transaction's account (incremental update)
    try {
      // Remove old transaction values
      await this.removeTransactionFromBalance(
        currentLinkedTransaction.account_id,
        userId,
        authToken,
        currentLinkedTransaction.amount,
        currentLinkedTransaction.is_cleared
      );

      // Add new transaction values
      const newAmount = linkedUpdatePayload.amount !== undefined ? linkedUpdatePayload.amount : currentLinkedTransaction.amount;
      const newIsCleared = linkedUpdatePayload.is_cleared !== undefined ? linkedUpdatePayload.is_cleared : currentLinkedTransaction.is_cleared;

      await this.addTransactionToBalance(
        currentLinkedTransaction.account_id,
        userId,
        authToken,
        newAmount,
        newIsCleared
      );
    } catch (balanceError) {
      console.error('Error updating linked account balances:', balanceError);
    }
  }

  private async deleteLinkedTransferTransaction(
    transferId: string,
    excludeTransactionId: string,
    userId: string,
    authToken: string
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Find the linked transfer transaction
    const { data: linkedTransaction, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transfer_id', transferId)
      .eq('user_id', userId)
      .neq('id', excludeTransactionId)
      .single();

    if (findError || !linkedTransaction) {
      console.error('Linked transfer transaction not found:', findError);
      return;
    }

    // Delete the linked transaction
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', linkedTransaction.id)
      .eq('user_id', userId);

    if (deleteError) {
      throw new Error(`Failed to delete linked transfer transaction: ${deleteError.message}`);
    }

    // Update account balances for the linked transaction's account (incremental update)
    try {
      // Use incremental balance update instead of full recalculation
      await this.removeTransactionFromBalance(
        linkedTransaction.account_id,
        userId,
        authToken,
        linkedTransaction.amount,
        linkedTransaction.is_cleared
      );
    } catch (balanceError) {
      console.error('Error updating linked account balances after deletion:', balanceError);
    }
  }

  /**
   * Check if a category is a payment category (ends with " Payment")
   */
  private async isPaymentCategory(categoryId: string, userId: string, authToken: string): Promise<boolean> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data: category, error } = await supabase
      .from('categories')
      .select('name')
      .eq('id', categoryId)
      .eq('user_id', userId)
      .single();

    if (error || !category) {
      return false;
    }

    // Payment categories end with " Payment"
    return category.name.endsWith(' Payment');
  }

  private async getAccountDetails(accountId: string, userId: string, authToken: string): Promise<any> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, account_type, budget_id, account_balance, cleared_balance, uncleared_balance, working_balance, is_active')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to get account details: ${error.message}`);
    }

    return data;
  }
}
