import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../supabase/supabase.service';
import { CategoryResponse, CategoryUpdateWithAffectedCategoriesResponse } from '../../dto/category.dto';
import { ReadyToAssignService } from '../../../ready-to-assign/ready-to-assign.service';
import { CreditCardDebtService } from '../../../credit-card-debt/credit-card-debt.service';

@Injectable()
export class CategoryMoneyMovementWriteService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly readyToAssignService: ReadyToAssignService,
    private readonly creditCardDebtService: CreditCardDebtService
  ) {}

  // Used when moving money between categories
  async moveMoney(
    sourceCategoryId: string,
    destinationCategoryId: string,
    amount: number,
    year: number,
    month: number,
    userId: string,
    authToken: string
  ): Promise<{ readyToAssign: number; sourceCategoryBalance: any; destinationCategoryBalance: any; affectedCategoryBalances?: any[] }> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Validate that both categories exist and belong to the user
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, budget_id')
      .in('id', [sourceCategoryId, destinationCategoryId])
      .eq('user_id', userId);

    if (categoriesError) {
      throw new Error(categoriesError.message);
    }

    if (categories.length !== 2) {
      throw new Error('One or both categories not found');
    }

    // Ensure both categories belong to the same budget
    const sourceBudgetId = categories.find(c => c.id === sourceCategoryId)?.budget_id;
    const destinationBudgetId = categories.find(c => c.id === destinationCategoryId)?.budget_id;

    if (sourceBudgetId !== destinationBudgetId) {
      throw new Error('Cannot move money between categories in different budgets');
    }

    // Get current balances for both categories
    const { data: balances, error: balancesError } = await supabase
      .from('category_balances')
      .select('category_id, available')
      .in('category_id', [sourceCategoryId, destinationCategoryId])
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month);

    if (balancesError) {
      throw new Error(balancesError.message);
    }

    const sourceBalance = balances.find(b => b.category_id === sourceCategoryId);
    const destinationBalance = balances.find(b => b.category_id === destinationCategoryId);

    if (!sourceBalance) {
      throw new Error('Source category balance not found for the specified month');
    }

    // Validate that source has enough available money
    if ((sourceBalance.available || 0) < amount) {
      throw new Error('Insufficient available balance in source category');
    }

    // Update source category balance (subtract amount)
    const { error: sourceError } = await supabase
      .from('category_balances')
      .update({ available: (sourceBalance.available || 0) - amount })
      .eq('category_id', sourceCategoryId)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month);

    if (sourceError) {
      throw new Error(sourceError.message);
    }

    // Update or create destination category balance (add amount)
    if (destinationBalance) {
      // Update existing balance
      const { error: destinationError } = await supabase
        .from('category_balances')
        .update({ available: (destinationBalance.available || 0) + amount })
        .eq('category_id', destinationCategoryId)
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month);

      if (destinationError) {
        // Rollback source update
        await supabase
          .from('category_balances')
          .update({ available: sourceBalance.available })
          .eq('category_id', sourceCategoryId)
          .eq('user_id', userId)
          .eq('year', year)
          .eq('month', month);

        throw new Error(destinationError.message);
      }
    } else {
      // Create new balance record for destination
      const { error: createError } = await supabase
        .from('category_balances')
        .insert({
          category_id: destinationCategoryId,
          budget_id: destinationBudgetId,
          user_id: userId,
          year,
          month,
          assigned: 0,
          activity: 0,
          available: amount
        });

      if (createError) {
        // Rollback source update
        await supabase
          .from('category_balances')
          .update({ available: sourceBalance.available })
          .eq('category_id', sourceCategoryId)
          .eq('user_id', userId)
          .eq('year', year)
          .eq('month', month);

        throw new Error(createError.message);
      }
    }

    // Handle YNAB-style credit card logic after successful money movement
    // This ensures that if money is moved to a category with uncovered credit card debt,
    // the appropriate amount is automatically moved to the payment category
    const affectedPaymentCategoryIds = await this.creditCardDebtService.handleCreditCardLogicForAssignments(
      [{ category_id: destinationCategoryId, amount: amount }],
      sourceBudgetId,
      userId,
      authToken,
      year,
      month
    );

    // Calculate updated Ready to Assign (should remain the same since we're just moving between categories)
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      sourceBudgetId,
      userId,
      authToken
    );

    // Get the updated source category balance
    const { data: updatedSourceBalance, error: sourceBalanceError } = await supabase
      .from('category_balances')
      .select('*')
      .eq('category_id', sourceCategoryId)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (sourceBalanceError) {
      throw new Error(sourceBalanceError.message);
    }

    // Get the updated destination category balance
    const { data: updatedDestinationBalance, error: destinationBalanceError } = await supabase
      .from('category_balances')
      .select('*')
      .eq('category_id', destinationCategoryId)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (destinationBalanceError) {
      throw new Error(destinationBalanceError.message);
    }

    // Get the affected payment category balances if any
    let affectedCategoryBalances: any[] = [];
    if (affectedPaymentCategoryIds.length > 0) {
      const { data: paymentBalances, error: paymentBalancesError } = await supabase
        .from('category_balances')
        .select('*')
        .in('category_id', affectedPaymentCategoryIds)
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month);

      if (!paymentBalancesError && paymentBalances) {
        affectedCategoryBalances = paymentBalances;
      }
    }

    return {
      readyToAssign,
      sourceCategoryBalance: updatedSourceBalance,
      destinationCategoryBalance: updatedDestinationBalance,
      affectedCategoryBalances
    };
  }

  // Used when moving money from a category to Ready to Assign
  async moveMoneyToReadyToAssign(
    sourceCategoryId: string,
    amount: number,
    year: number,
    month: number,
    userId: string,
    authToken: string
  ): Promise<CategoryUpdateWithAffectedCategoriesResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Validate that the source category exists and belongs to the user
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id, budget_id')
      .eq('id', sourceCategoryId)
      .eq('user_id', userId)
      .single();

    if (categoryError) {
      throw new Error(categoryError.message);
    }

    if (!category) {
      throw new Error('Source category not found');
    }

    // Get current balance for the source category
    const { data: balance, error: balanceError } = await supabase
      .from('category_balances')
      .select('available, assigned')
      .eq('category_id', sourceCategoryId)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (balanceError) {
      throw new Error(balanceError.message);
    }

    if (!balance) {
      throw new Error('Source category balance not found for the specified month');
    }

    // Validate that source has enough available money
    if ((balance.available || 0) < amount) {
      throw new Error('Insufficient available balance in source category');
    }

    // Update source category balance (subtract amount from both available and assigned)
    const { error: updateError } = await supabase
      .from('category_balances')
      .update({
        available: (balance.available || 0) - amount,
        assigned: (balance.assigned || 0) - amount
      })
      .eq('category_id', sourceCategoryId)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Calculate updated Ready to Assign
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      category.budget_id,
      userId,
      authToken
    );

    // Get the updated category balance
    const { data: updatedBalance, error: updatedBalanceError } = await supabase
      .from('category_balances')
      .select('*')
      .eq('category_id', sourceCategoryId)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (updatedBalanceError) {
      throw new Error(updatedBalanceError.message);
    }

    // Get the category data for the response
    const { data: categoryData, error: categoryDataError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', sourceCategoryId)
      .eq('user_id', userId)
      .single();

    if (categoryDataError) {
      throw new Error(categoryDataError.message);
    }

    // Return category with default balance values (frontend will merge with actual balances)
    const categoryResponse: CategoryResponse = {
      ...categoryData,
      assigned: 0,
      activity: 0,
      available: 0
    };

    return {
      readyToAssign,
      category: categoryResponse,
      categoryBalance: updatedBalance
    };
  }

  // Used when moving money from Ready to Assign to a category
  async pullFromReadyToAssign(
    destinationCategoryId: string,
    amount: number,
    year: number,
    month: number,
    userId: string,
    authToken: string
  ): Promise<CategoryUpdateWithAffectedCategoriesResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Validate that the destination category exists and belongs to the user
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id, budget_id')
      .eq('id', destinationCategoryId)
      .eq('user_id', userId)
      .single();

    if (categoryError) {
      throw new Error(categoryError.message);
    }

    if (!category) {
      throw new Error('Destination category not found');
    }

    // Allow Ready to Assign to go negative - no validation needed

    // Get or create the destination category balance for the specified month
    let { data: balance, error: balanceError } = await supabase
      .from('category_balances')
      .select('id, assigned, available')
      .eq('category_id', destinationCategoryId)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    if (balanceError) {
      throw new Error(balanceError.message);
    }

    if (!balance) {
      // Create new balance record
      const { error: createError } = await supabase
        .from('category_balances')
        .insert({
          category_id: destinationCategoryId,
          budget_id: category.budget_id,
          user_id: userId,
          year,
          month,
          assigned: amount,
          activity: 0,
          available: amount
        })
        .select('id, assigned, available')
        .single();

      if (createError) {
        throw new Error(createError.message);
      }
    } else {
      // Update existing balance record
      const { error: updateError } = await supabase
        .from('category_balances')
        .update({
          assigned: (balance.assigned || 0) + amount,
          available: (balance.available || 0) + amount
        })
        .eq('id', balance.id);

      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    // Calculate updated Ready to Assign
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      category.budget_id,
      userId,
      authToken
    );

    // Get the updated category balance
    const { data: updatedBalance, error: updatedBalanceError } = await supabase
      .from('category_balances')
      .select('*')
      .eq('category_id', destinationCategoryId)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (updatedBalanceError) {
      throw new Error(updatedBalanceError.message);
    }

    // Get the category data for the response
    const { data: categoryData, error: categoryDataError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', destinationCategoryId)
      .eq('user_id', userId)
      .single();

    if (categoryDataError) {
      throw new Error(categoryDataError.message);
    }

    // Handle YNAB-style credit card logic after successful assignment
    const affectedPaymentCategoryIds = await this.creditCardDebtService.handleCreditCardLogicForAssignments(
      [{ category_id: destinationCategoryId, amount: amount }],
      category.budget_id,
      userId,
      authToken,
      year,
      month
    );

    // Get the affected payment category balances if any
    let affectedCategoryBalances: any[] = [];
    if (affectedPaymentCategoryIds.length > 0) {
      const { data: paymentBalances, error: paymentBalancesError } = await supabase
        .from('category_balances')
        .select('*')
        .in('category_id', affectedPaymentCategoryIds)
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month);

      if (!paymentBalancesError && paymentBalances) {
        affectedCategoryBalances = paymentBalances;
      }
    }

    // Return category with default balance values (frontend will merge with actual balances)
    const categoryResponse: CategoryResponse = {
      ...categoryData,
      assigned: 0,
      activity: 0,
      available: 0
    };

    return {
      readyToAssign,
      category: categoryResponse,
      categoryBalance: updatedBalance,
      affectedCategoryBalances
    };
  }
}
