import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../supabase/supabase.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryResponse, ReorderCategoriesDto, CategoryWithReadyToAssignResponse, CategoryUpdateWithAffectedCategoriesResponse } from '../../dto/category.dto';
import { ReadyToAssignService } from '../../../ready-to-assign/ready-to-assign.service';
import { CreditCardDebtService } from '../../../credit-card-debt/credit-card-debt.service';

@Injectable()
export class CategoryWriteService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly readyToAssignService: ReadyToAssignService,
    private readonly creditCardDebtService: CreditCardDebtService
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

  async update(id: string, updateCategoryDto: UpdateCategoryDto, userId: string, authToken: string, year?: number, month?: number): Promise<CategoryWithReadyToAssignResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

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
      console.log(`🔍 Category update: assigned=${assigned}, activity=${activity}, available=${available}`);
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

        // Handle YNAB-style credit card logic after successful assignment
        if (assignedDifference > 0) {
          console.log(`🚀 Triggering credit card assignment logic for category ${id}, amount: ${assignedDifference}`);
          // Get category data for budget_id
          const { data: categoryData } = await supabase
            .from('categories')
            .select('budget_id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

          if (categoryData) {
            await this.creditCardDebtService.handleCreditCardLogicForAssignments(
              [{ category_id: id, amount: assignedDifference }],
              categoryData.budget_id,
              userId,
              authToken,
              targetYear,
              targetMonth
            );
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
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Perform the regular update
    const result = await this.update(id, updateCategoryDto, userId, authToken, year, month);

    // Get the current month if not specified
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);

    // Fetch the updated category balance
    const { data: categoryBalance, error: balanceError } = await supabase
      .from('category_balances')
      .select('*')
      .eq('category_id', id)
      .eq('user_id', userId)
      .eq('year', targetYear)
      .eq('month', targetMonth)
      .single();

    if (balanceError) {
      throw new Error(balanceError.message);
    }

    // No affected categories for cash-only system
    let affectedCategories: CategoryResponse[] = [];

    return {
      readyToAssign: result.readyToAssign,
      category: result.category, // Include the updated category data
      categoryBalance,
      affectedCategories: affectedCategories.length > 0 ? affectedCategories : undefined
    };
  }

  async hide(id: string, userId: string, authToken: string): Promise<{ readyToAssign: number; category: CategoryResponse }> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get category data
    const { data: categoryData, error: fetchError } = await supabase
      .from('categories')
      .select('budget_id, category_group_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    // Get the Hidden Categories group for this budget
    const { data: hiddenGroup, error: hiddenGroupError } = await supabase
      .from('category_groups')
      .select('id')
      .eq('budget_id', categoryData.budget_id)
      .eq('user_id', userId)
      .eq('name', 'Hidden Categories')
      .eq('is_system_group', true)
      .single();

    if (hiddenGroupError) {
      throw new Error('Hidden Categories group not found');
    }

    // Move category to Hidden Categories group
    const { error: updateError } = await supabase
      .from('categories')
      .update({ category_group_id: hiddenGroup.id })
      .eq('id', id)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Get the updated category data
    const { data: updatedCategory, error: updatedCategoryError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (updatedCategoryError) {
      throw new Error(updatedCategoryError.message);
    }

    // Calculate updated Ready to Assign (should remain the same since we're just moving)
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      categoryData.budget_id,
      userId,
      authToken
    );

    // Return category with default balance values (frontend will merge with actual balances)
    const category: CategoryResponse = {
      ...updatedCategory,
      assigned: 0,
      activity: 0,
      available: 0
    };

    return { readyToAssign, category };
  }

  async unhide(id: string, userId: string, authToken: string, targetGroupId?: string): Promise<{ readyToAssign: number; category: CategoryResponse }> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get category data
    const { data: categoryData, error: fetchError } = await supabase
      .from('categories')
      .select('budget_id, category_group_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    // Verify category is currently in Hidden Categories group
    const { data: currentGroup, error: groupError } = await supabase
      .from('category_groups')
      .select('name, is_system_group')
      .eq('id', categoryData.category_group_id)
      .eq('user_id', userId)
      .single();

    if (groupError || currentGroup.name !== 'Hidden Categories') {
      throw new Error('Category is not currently hidden');
    }

    // If no target group specified, move to first non-system group
    let targetGroup = targetGroupId;
    if (!targetGroup) {
      const { data: firstGroup, error: firstGroupError } = await supabase
        .from('category_groups')
        .select('id')
        .eq('budget_id', categoryData.budget_id)
        .eq('user_id', userId)
        .eq('is_system_group', false)
        .order('display_order', { ascending: true })
        .limit(1)
        .single();

      if (firstGroupError) {
        throw new Error('No available category group to move to');
      }
      targetGroup = firstGroup.id;
    }

    // Move category to target group
    const { error: updateError } = await supabase
      .from('categories')
      .update({ category_group_id: targetGroup })
      .eq('id', id)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Get the updated category data
    const { data: updatedCategory, error: updatedCategoryError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (updatedCategoryError) {
      throw new Error(updatedCategoryError.message);
    }

    // Calculate updated Ready to Assign (should remain the same since we're just moving)
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(
      categoryData.budget_id,
      userId,
      authToken
    );

    // Return category with default balance values (frontend will merge with actual balances)
    const category: CategoryResponse = {
      ...updatedCategory,
      assigned: 0,
      activity: 0,
      available: 0
    };

    return { readyToAssign, category };
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

    if (updates.length === 0) {
      return { successCount: 0, appliedCategories: [] };
    }

    try {
      // Extract category IDs for bulk operations
      const categoryIds = updates.map(u => u.category_id);

      // Pre-fetch all required data in bulk
      const [categoriesResult, balancesResult] = await Promise.all([
        // Get budget_ids for all categories
        supabase
          .from('categories')
          .select('id, budget_id')
          .in('id', categoryIds)
          .eq('user_id', userId),

        // Get current balances for all categories
        supabase
          .from('category_balances')
          .select('category_id, assigned, available')
          .in('category_id', categoryIds)
          .eq('user_id', userId)
          .eq('year', year)
          .eq('month', month)
      ]);

      if (categoriesResult.error) {
        throw new Error(`Failed to fetch categories: ${categoriesResult.error.message}`);
      }

      if (balancesResult.error) {
        throw new Error(`Failed to fetch balances: ${balancesResult.error.message}`);
      }

      // Create lookup maps for efficient access
      const categoryMap = new Map(categoriesResult.data?.map(c => [c.id, c.budget_id]) || []);
      const balanceMap = new Map(balancesResult.data?.map(b => [b.category_id, b]) || []);

      // Prepare upsert data
      const upsertData: any[] = [];
      const appliedCategories: { category_id: string; amount: number }[] = [];

      for (const update of updates) {
        const budgetId = categoryMap.get(update.category_id);
        if (!budgetId) {
          console.error(`Category not found: ${update.category_id}`);
          continue;
        }

        const currentBalance = balanceMap.get(update.category_id);
        let newAssigned: number;
        let newAvailable: number;

        if (currentBalance) {
          // For auto-assign, we ADD the amount to existing assigned (not set to that amount)
          newAssigned = (currentBalance.assigned || 0) + update.amount;
          // Update available by adding the difference (YNAB behavior)
          newAvailable = (currentBalance.available || 0) + update.amount;
        } else {
          // No existing balance, so available equals assigned for new records
          newAssigned = update.amount;
          newAvailable = update.amount;
        }

        upsertData.push({
          category_id: update.category_id,
          budget_id: budgetId,
          user_id: userId,
          year: year,
          month: month,
          assigned: newAssigned,
          activity: 0, // Default for new records, existing records will keep their activity
          available: newAvailable
        });

        appliedCategories.push({
          category_id: update.category_id,
          amount: update.amount // This represents the amount added, not the total assigned
        });
      }

      // Perform bulk upsert operation
      const { error: upsertError } = await supabase
        .from('category_balances')
        .upsert(upsertData, {
          onConflict: 'category_id,user_id,year,month',
          ignoreDuplicates: false
        });

      if (upsertError) {
        throw new Error(`Failed to upsert balances: ${upsertError.message}`);
      }

      // Handle YNAB-style credit card logic after successful assignment
      if (appliedCategories.length > 0) {
        // Get budget_id from the first category (all categories in a batch belong to the same budget)
        const { data: categoryData } = await supabase
          .from('categories')
          .select('budget_id')
          .eq('id', appliedCategories[0].category_id)
          .eq('user_id', userId)
          .single();

        if (categoryData) {
          await this.creditCardDebtService.handleCreditCardLogicForAssignments(appliedCategories, categoryData.budget_id, userId, authToken, year, month);
        }
      }

      return {
        successCount: appliedCategories.length,
        appliedCategories
      };

    } catch (error) {
      console.error('Batch update assigned failed:', error);
      // Fallback to individual processing if bulk operation fails
      return this.batchUpdateAssignedFallback(updates, userId, authToken, year, month);
    }
  }

  /**
   * Fallback method for batch update when bulk operation fails
   * Uses the original sequential approach for reliability
   */
  private async batchUpdateAssignedFallback(
    updates: { category_id: string; amount: number }[],
    userId: string,
    authToken: string,
    year: number,
    month: number
  ): Promise<{ successCount: number; appliedCategories: { category_id: string; amount: number }[] }> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    let successCount = 0;
    const appliedCategories: { category_id: string; amount: number }[] = [];

    // Process updates individually as fallback
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

        let newAssigned = update.amount;
        let newAvailable = update.amount;

        if (currentBalance) {
          // For auto-assign, we ADD the amount to existing assigned (not set to that amount)
          newAssigned = (currentBalance.assigned || 0) + update.amount;
          // Update available by adding the difference (YNAB behavior)
          newAvailable = (currentBalance.available || 0) + update.amount;
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

    // Handle YNAB-style credit card logic after successful assignment (fallback path)
    if (appliedCategories.length > 0) {
      // Get budget_id from the first category (all categories in a batch belong to the same budget)
      const { data: categoryData } = await supabase
        .from('categories')
        .select('budget_id')
        .eq('id', appliedCategories[0].category_id)
        .eq('user_id', userId)
        .single();

      if (categoryData) {
        await this.creditCardDebtService.handleCreditCardLogicForAssignments(appliedCategories, categoryData.budget_id, userId, authToken, year, month);
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
  ): Promise<{ readyToAssign: number; sourceCategoryBalance: any; destinationCategoryBalance: any }> {
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

    return {
      readyToAssign,
      sourceCategoryBalance: updatedSourceBalance,
      destinationCategoryBalance: updatedDestinationBalance
    };
  }

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
      .single();

    if (balanceError && balanceError.code !== 'PGRST116') {
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
    await this.creditCardDebtService.handleCreditCardLogicForAssignments(
      [{ category_id: destinationCategoryId, amount: amount }],
      category.budget_id,
      userId,
      authToken,
      year,
      month
    );

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
}
