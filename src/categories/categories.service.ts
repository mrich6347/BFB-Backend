import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryResponse, ReorderCategoriesDto, CategoryWithReadyToAssignResponse } from './dto/category.dto';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly readyToAssignService: ReadyToAssignService
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

  async remove(id: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Check if this is a credit card payment category and prevent deletion
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
  }
}
