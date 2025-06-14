import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryResponse, ReorderCategoriesDto, CategoryWithReadyToAssignResponse, CategoryUpdateWithAffectedCategoriesResponse } from './dto/category.dto';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';
import { DebtTrackingService } from '../debt-tracking/debt-tracking.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly readyToAssignService: ReadyToAssignService,
    private readonly debtTrackingService: DebtTrackingService
  ) {}

  async create(createCategoryDto: CreateCategoryDto, userId: string, authToken: string): Promise<CategoryWithReadyToAssignResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Check if the target category group is a system group and prevent manual category creation
    const { data: groupData, error: groupError } = await supabase
      .from('category_groups')
      .select('is_system_group, name')
      .eq('id', createCategoryDto.category_group_id)
      .eq('user_id', userId)
      .single();

    if (groupError) {
      throw new Error(groupError.message);
    }

    if (groupData.is_system_group) {
      throw new Error(`Cannot manually add categories to the "${groupData.name}" group`);
    }

    const payload = {
      ...createCategoryDto,
      user_id: userId
    };

    const { data, error } = await supabase
      .from('categories')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Create initial category balance for current month only
    // (only for manually created categories, not default ones from trigger)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const balancePayload = {
      category_id: data.id,
      budget_id: createCategoryDto.budget_id,
      user_id: userId,
      year: currentYear,
      month: currentMonth,
      assigned: 0,
      activity: 0,
      available: 0
    };

    const { error: balanceError } = await supabase
      .from('category_balances')
      .insert([balancePayload]);

    if (balanceError) {
      // If balance creation fails, clean up the category
      await supabase.from('categories').delete().eq('id', data.id);
      throw new Error(balanceError.message);
    }

    // Calculate updated Ready to Assign after category creation
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      createCategoryDto.budget_id,
      userId,
      authToken
    );

    // Return category with current month balances
    const category: CategoryResponse = {
      ...data,
      assigned: 0,
      activity: 0,
      available: 0
    };

    return {
      category,
      readyToAssign
    };
  }

  async findAll(categoryGroupId: string, userId: string, authToken: string, year?: number, month?: number): Promise<CategoryResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Use current month if not specified
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);

    const { data, error } = await supabase
      .from('categories')
      .select(`
        *,
        category_balances!inner(assigned, activity, available)
      `)
      .eq('category_group_id', categoryGroupId)
      .eq('user_id', userId)
      .eq('category_balances.year', targetYear)
      .eq('category_balances.month', targetMonth)
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    // Flatten the response to include balance fields directly
    return data.map(category => ({
      ...category,
      assigned: category.category_balances[0]?.assigned || 0,
      activity: category.category_balances[0]?.activity || 0,
      available: category.category_balances[0]?.available || 0,
      category_balances: undefined
    }));
  }

  async findAllByBudget(budgetId: string, userId: string, authToken: string, year?: number, month?: number): Promise<CategoryResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Use current month if not specified
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);

    const { data, error } = await supabase
      .from('categories')
      .select(`
        *,
        category_balances!inner(assigned, activity, available)
      `)
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .eq('category_balances.year', targetYear)
      .eq('category_balances.month', targetMonth)
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    // Flatten the response to include balance fields directly
    return data.map(category => ({
      ...category,
      assigned: category.category_balances[0]?.assigned || 0,
      activity: category.category_balances[0]?.activity || 0,
      available: category.category_balances[0]?.available || 0,
      category_balances: undefined
    }));
  }

  async findAllByBudgetWithoutBalances(budgetId: string, userId: string, authToken: string): Promise<CategoryResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    // Return categories with default balance values
    return data.map(category => ({
      ...category,
      assigned: 0,
      activity: 0,
      available: 0
    }));
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto, userId: string, authToken: string, year?: number, month?: number): Promise<CategoryWithReadyToAssignResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Check if this is a credit card payment category and prevent name changes
    if (updateCategoryDto.name) {
      const { data: categoryData, error: fetchError } = await supabase
        .from('categories')
        .select('is_credit_card_payment')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (categoryData.is_credit_card_payment) {
        throw new Error('Credit card payment categories cannot be renamed');
      }
    }

    // Separate category fields from balance fields
    const { assigned, activity, available, ...categoryFields } = updateCategoryDto;

    // Update category fields if any
    if (Object.keys(categoryFields).length > 0) {
      const { error: categoryError } = await supabase
        .from('categories')
        .update(categoryFields)
        .eq('id', id)
        .eq('user_id', userId);

      if (categoryError) {
        throw new Error(categoryError.message);
      }
    }

    // Update balance fields if any
    if (assigned !== undefined || activity !== undefined || available !== undefined) {
      const now = new Date();
      const targetYear = year || now.getFullYear();
      const targetMonth = month || (now.getMonth() + 1);

      // If we're updating assigned, we need to calculate the new available amount
      let balanceUpdate: any = {};

      if (assigned !== undefined) {
        // Get current balance to calculate the difference (handle case where no balance exists)
        const { data: currentBalance, error: balanceQueryError } = await supabase
          .from('category_balances')
          .select('assigned, available')
          .eq('category_id', id)
          .eq('user_id', userId)
          .eq('year', targetYear)
          .eq('month', targetMonth)
          .maybeSingle();

        // If there's an error other than "no rows found", throw it
        if (balanceQueryError && balanceQueryError.code !== 'PGRST116') {
          throw new Error(balanceQueryError.message);
        }

        let assignedDifference = 0;

        if (currentBalance) {
          // Calculate the difference in assigned amount
          assignedDifference = assigned - (currentBalance.assigned || 0);
          // Update available by adding the difference (YNAB behavior)
          balanceUpdate.available = (currentBalance.available || 0) + assignedDifference;
        } else {
          // No existing balance, so available equals assigned for new records
          assignedDifference = assigned;
          balanceUpdate.available = assigned;
        }

        balanceUpdate.assigned = assigned;

        // Handle debt coverage if money was added to the category
        if (assignedDifference > 0) {
          try {
            await this.handleDebtCoverageForCategory(
              id,
              assignedDifference,
              userId,
              authToken
            );
          } catch (debtError) {
            console.error('Error handling debt coverage:', debtError);
            // Don't throw here - category update was successful, debt coverage is secondary
          }
        }

        // Simplified: Only update current month (no future month cascading)
      }

      if (activity !== undefined) balanceUpdate.activity = activity;
      if (available !== undefined) balanceUpdate.available = available;

      // Check if balance record exists
      const { data: existingBalance } = await supabase
        .from('category_balances')
        .select('id')
        .eq('category_id', id)
        .eq('user_id', userId)
        .eq('year', targetYear)
        .eq('month', targetMonth)
        .maybeSingle();

      if (existingBalance) {
        // Update existing balance
        const { error: balanceError } = await supabase
          .from('category_balances')
          .update(balanceUpdate)
          .eq('category_id', id)
          .eq('user_id', userId)
          .eq('year', targetYear)
          .eq('month', targetMonth);

        if (balanceError) {
          throw new Error(balanceError.message);
        }
      } else {
        // Create new balance record
        const { data: categoryData } = await supabase
          .from('categories')
          .select('budget_id')
          .eq('id', id)
          .eq('user_id', userId)
          .single();

        if (!categoryData) {
          throw new Error('Category not found');
        }

        const { error: insertError } = await supabase
          .from('category_balances')
          .insert({
            category_id: id,
            budget_id: categoryData.budget_id,
            user_id: userId,
            year: targetYear,
            month: targetMonth,
            assigned: balanceUpdate.assigned || 0,
            activity: balanceUpdate.activity || 0,
            available: balanceUpdate.available || 0
          });

        if (insertError) {
          throw new Error(insertError.message);
        }
      }
    }

    // Fetch the updated category without balances (since we load balances separately now)
    const { data: categoryData, error: categoryError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (categoryError) {
      throw new Error(categoryError.message);
    }

    // Calculate updated Ready to Assign after category update
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      categoryData.budget_id,
      userId,
      authToken
    );

    // Return category with default balance values (frontend will merge with actual balances)
    const category: CategoryResponse = {
      ...categoryData,
      assigned: 0,
      activity: 0,
      available: 0
    };

    return {
      category,
      readyToAssign
    };
  }

  async updateWithAffectedCategories(id: string, updateCategoryDto: UpdateCategoryDto, userId: string, authToken: string, year?: number, month?: number): Promise<CategoryUpdateWithAffectedCategoriesResponse> {
    // Track affected payment categories before the update
    const affectedPaymentCategories: string[] = [];

    // If we're updating assigned amount, check if this category has debt that might be covered
    if (updateCategoryDto.assigned !== undefined) {
      const uncoveredDebts = await this.debtTrackingService.getUncoveredDebts(id, userId, authToken);

      // Collect payment category IDs that might be affected
      for (const debt of uncoveredDebts) {
        if (!affectedPaymentCategories.includes(debt.payment_category_id)) {
          affectedPaymentCategories.push(debt.payment_category_id);
        }
      }
    }

    // Perform the regular update
    const result = await this.update(id, updateCategoryDto, userId, authToken, year, month);

    // If there are affected payment categories, fetch their updated balances
    let affectedCategories: CategoryResponse[] = [];

    if (affectedPaymentCategories.length > 0) {
      const supabase = this.supabaseService.getAuthenticatedClient(authToken);
      const now = new Date();
      const targetYear = year || now.getFullYear();
      const targetMonth = month || (now.getMonth() + 1);

      // Fetch updated payment categories with their current balances
      const { data: paymentCategoriesData, error } = await supabase
        .from('categories')
        .select(`
          *,
          category_balances!inner(assigned, activity, available)
        `)
        .in('id', affectedPaymentCategories)
        .eq('user_id', userId)
        .eq('category_balances.year', targetYear)
        .eq('category_balances.month', targetMonth);

      if (!error && paymentCategoriesData) {
        affectedCategories = paymentCategoriesData.map(cat => ({
          ...cat,
          assigned: cat.category_balances[0]?.assigned || 0,
          activity: cat.category_balances[0]?.activity || 0,
          available: cat.category_balances[0]?.available || 0
        }));
      }
    }

    return {
      category: result.category,
      readyToAssign: result.readyToAssign,
      affectedCategories: affectedCategories.length > 0 ? affectedCategories : undefined
    };
  }

  async remove(id: string, userId: string, authToken: string): Promise<{ readyToAssign: number }> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Check if this is a credit card payment category and prevent deletion
    const { data: categoryData, error: fetchError } = await supabase
      .from('categories')
      .select('is_credit_card_payment, budget_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (categoryData.is_credit_card_payment) {
      throw new Error('Credit card payment categories cannot be deleted');
    }

    // Delete category balances first (due to foreign key constraint)
    const { error: balanceError } = await supabase
      .from('category_balances')
      .delete()
      .eq('category_id', id)
      .eq('user_id', userId);

    if (balanceError) {
      throw new Error(balanceError.message);
    }

    // Then delete the category
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    // Calculate updated Ready to Assign after category deletion
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      categoryData.budget_id,
      userId,
      authToken
    );

    return { readyToAssign };
  }

  async reorder(reorderDto: ReorderCategoriesDto, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Update display_order for each category
    for (let i = 0; i < reorderDto.category_ids.length; i++) {
      const { error } = await supabase
        .from('categories')
        .update({ display_order: i })
        .eq('id', reorderDto.category_ids[i])
        .eq('user_id', userId);

      if (error) {
        throw new Error(error.message);
      }
    }
  }

  async batchUpdateAssigned(
    updates: { category_id: string; amount: number }[],
    userId: string,
    authToken: string,
    year: number,
    month: number
  ): Promise<{ successCount: number; appliedCategories: { category_id: string; amount: number }[] }> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    let successCount = 0;
    const appliedCategories: { category_id: string; amount: number }[] = [];

    // Process updates in batches for better performance
    for (const update of updates) {
      try {
        // Get current balance for this category
        const { data: currentBalance } = await supabase
          .from('category_balances')
          .select('assigned, available')
          .eq('category_id', update.category_id)
          .eq('user_id', userId)
          .eq('year', year)
          .eq('month', month)
          .single();

        let assignedDifference = 0;
        let newAssigned = update.amount;
        let newAvailable = update.amount;

        if (currentBalance) {
          // For auto-assign, we ADD the amount to existing assigned (not set to that amount)
          newAssigned = (currentBalance.assigned || 0) + update.amount;
          assignedDifference = update.amount; // The amount we're adding
          // Update available by adding the difference (YNAB behavior)
          newAvailable = (currentBalance.available || 0) + assignedDifference;
        } else {
          // No existing balance, so available equals assigned for new records
          assignedDifference = update.amount;
          newAvailable = update.amount;
          newAssigned = update.amount;
        }

        // Update or create balance record
        const balanceUpdate = {
          assigned: newAssigned,
          available: newAvailable
        };

        if (currentBalance) {
          // Update existing balance
          const { error: balanceError } = await supabase
            .from('category_balances')
            .update(balanceUpdate)
            .eq('category_id', update.category_id)
            .eq('user_id', userId)
            .eq('year', year)
            .eq('month', month);

          if (balanceError) {
            console.error(`Failed to update balance for category ${update.category_id}:`, balanceError);
            continue;
          }
        } else {
          // Create new balance record - need to get budget_id first
          const { data: categoryData } = await supabase
            .from('categories')
            .select('budget_id')
            .eq('id', update.category_id)
            .eq('user_id', userId)
            .single();

          if (!categoryData) {
            console.error(`Category not found: ${update.category_id}`);
            continue;
          }

          const { error: insertError } = await supabase
            .from('category_balances')
            .insert({
              category_id: update.category_id,
              budget_id: categoryData.budget_id,
              user_id: userId,
              year: year,
              month: month,
              assigned: update.amount,
              activity: 0,
              available: newAvailable
            });

          if (insertError) {
            console.error(`Failed to create balance for category ${update.category_id}:`, insertError);
            continue;
          }
        }

        // Handle debt coverage if money was added to the category
        if (assignedDifference > 0) {
          try {
            await this.handleDebtCoverageForCategory(
              update.category_id,
              assignedDifference,
              userId,
              authToken
            );
          } catch (debtError) {
            console.error('Error handling debt coverage:', debtError);
            // Don't fail the whole operation for debt coverage errors
          }
        }

        successCount++;
        appliedCategories.push({
          category_id: update.category_id,
          amount: update.amount // This represents the amount added, not the total assigned
        });
      } catch (error) {
        console.error(`Failed to update category ${update.category_id}:`, error);
        // Continue with other categories even if one fails
      }
    }

    return { successCount, appliedCategories };
  }

  async moveMoney(
    sourceCategoryId: string,
    destinationCategoryId: string,
    amount: number,
    year: number,
    month: number,
    userId: string,
    authToken: string
  ): Promise<void> {
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

    // Handle debt coverage for the destination category
    // This ensures that if the destination category has uncovered credit card debt,
    // the money we just moved will be used to cover that debt
    try {
      await this.handleDebtCoverageForCategory(
        destinationCategoryId,
        amount,
        userId,
        authToken
      );
    } catch (debtCoverageError) {
      console.error('Error handling debt coverage in moveMoney:', debtCoverageError);
      // Don't throw here - the money transfer was successful, debt coverage is secondary
    }
  }



  async moveMoneyToReadyToAssign(
    sourceCategoryId: string,
    amount: number,
    year: number,
    month: number,
    userId: string,
    authToken: string
  ): Promise<void> {
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
    // This effectively moves the money back to Ready to Assign by "un-assigning" it
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
  }

  async pullFromReadyToAssign(
    destinationCategoryId: string,
    amount: number,
    year: number,
    month: number,
    userId: string,
    authToken: string
  ): Promise<void> {
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

    // Calculate current Ready to Assign to validate we have enough
    const currentReadyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      category.budget_id,
      userId,
      authToken
    );

    if (currentReadyToAssign < amount) {
      throw new Error('Insufficient Ready to Assign balance');
    }

    // Get or create the destination category balance for the specified month
    let { data: balance, error: balanceError } = await supabase
      .from('category_balances')
      .select('id, assigned, available')
      .eq('category_id', destinationCategoryId)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (balanceError && balanceError.code !== 'PGRST116') {
      throw new Error(balanceError.message);
    }

    if (!balance) {
      // Create new balance record
      const { data: newBalance, error: createError } = await supabase
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

    // Handle debt coverage for the destination category
    // This ensures that if the destination category has uncovered credit card debt,
    // the money we just pulled from Ready to Assign will be used to cover that debt
    try {
      await this.handleDebtCoverageForCategory(
        destinationCategoryId,
        amount,
        userId,
        authToken
      );
    } catch (debtCoverageError) {
      console.error('Error handling debt coverage in pullFromReadyToAssign:', debtCoverageError);
      // Don't throw here - the money transfer was successful, debt coverage is secondary
    }
  }

  /**
   * Handle debt coverage when money is assigned to categories
   */
  private async handleDebtCoverageForCategory(
    categoryId: string,
    assignedAmountIncrease: number,
    userId: string,
    authToken: string
  ): Promise<void> {
    if (assignedAmountIncrease <= 0) return;

    console.log(`💰 Attempting to cover debt for category ${categoryId} with ${assignedAmountIncrease}`);

    // Get all uncovered debt records for this category using the debt tracking service
    const uncoveredDebts = await this.debtTrackingService.getUncoveredDebts(categoryId, userId, authToken);

    if (uncoveredDebts.length === 0) {
      console.log('No uncovered debt found for category');
      return;
    }

    let remainingAmount = assignedAmountIncrease;

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
    userId: string,
    authToken: string
  ): Promise<void> {
    console.log(`🔄 Handling cross-month debt coverage: ${coverageAmount} to payment category ${debtRecord.payment_category_id}`);

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

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
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get existing balance
    const { data: existingBalance } = await supabase
      .from('category_balances')
      .select('*')
      .eq('category_id', categoryId)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    if (existingBalance) {
      const updateData = {
        [field]: (existingBalance[field] || 0) + amount
      };

      const { error } = await supabase
        .from('category_balances')
        .update(updateData)
        .eq('category_id', categoryId)
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      // Create new balance record
      const balanceData = {
        category_id: categoryId,
        budget_id: budgetId,
        user_id: userId,
        year,
        month,
        assigned: 0,
        activity: 0,
        available: 0,
        [field]: amount
      };

      const { error } = await supabase
        .from('category_balances')
        .insert(balanceData);

      if (error) {
        throw new Error(error.message);
      }
    }
  }
}
