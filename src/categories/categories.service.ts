import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryResponse, ReorderCategoriesDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(createCategoryDto: CreateCategoryDto, userId: string, authToken: string): Promise<CategoryResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

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

    // Create initial category balances for current month and next month
    // (only for manually created categories, not default ones from trigger)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

    const balancePayloads = [
      {
        category_id: data.id,
        budget_id: createCategoryDto.budget_id,
        user_id: userId,
        year: currentYear,
        month: currentMonth,
        assigned: 0,
        activity: 0,
        available: 0
      },
      {
        category_id: data.id,
        budget_id: createCategoryDto.budget_id,
        user_id: userId,
        year: nextYear,
        month: nextMonth,
        assigned: 0,
        activity: 0,
        available: 0
      }
    ];

    const { error: balanceError } = await supabase
      .from('category_balances')
      .insert(balancePayloads);

    if (balanceError) {
      // If balance creation fails, clean up the category
      await supabase.from('categories').delete().eq('id', data.id);
      throw new Error(balanceError.message);
    }

    // Return category with current month balances
    return {
      ...data,
      assigned: 0,
      activity: 0,
      available: 0
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

  async update(id: string, updateCategoryDto: UpdateCategoryDto, userId: string, authToken: string, year?: number, month?: number, currentUserYear?: number, currentUserMonth?: number): Promise<CategoryResponse> {
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

        // YNAB Logic: Update available balances for all future months
        if (assignedDifference !== 0) {
          // Get category data for budget_id
          const { data: categoryData } = await supabase
            .from('categories')
            .select('budget_id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

          if (categoryData) {
            await this.updateFutureMonthsAvailable(supabase, id, categoryData.budget_id, userId, targetYear, targetMonth, assignedDifference, currentUserYear, currentUserMonth);
          }
        }
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

    // Return category with default balance values (frontend will merge with actual balances)
    return {
      ...categoryData,
      assigned: 0,
      activity: 0,
      available: 0
    };
  }

  async remove(id: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

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

  // Helper method to update available balances for all future months (YNAB logic)
  private async updateFutureMonthsAvailable(
    supabase: any,
    categoryId: string,
    budgetId: string,
    userId: string,
    fromYear: number,
    fromMonth: number,
    difference: number,
    currentUserYear?: number,
    currentUserMonth?: number
  ) {
    // Calculate all future months up to 2 months from current user month
    // If user month not provided, fall back to server time
    const now = new Date();
    const currentRealYear = currentUserYear || now.getFullYear();
    const currentRealMonth = currentUserMonth || (now.getMonth() + 1);

    const futureMonths: { year: number; month: number }[] = [];
    let checkYear = fromYear;
    let checkMonth = fromMonth + 1;

    // Generate list of future months to check/create
    while (true) {
      if (checkMonth > 12) {
        checkMonth = 1;
        checkYear += 1;
      }

      // Check if this month is within the 2-month future limit
      const monthsDiff = (checkYear - currentRealYear) * 12 + (checkMonth - currentRealMonth);
      if (monthsDiff > 2) {
        break;
      }

      futureMonths.push({ year: checkYear, month: checkMonth });
      checkMonth += 1;
    }

    // For each future month, either update existing balance or create new one
    for (const { year, month } of futureMonths) {
      // Check if balance exists for this month
      const { data: existingBalance, error: checkError } = await supabase
        .from('category_balances')
        .select('*')
        .eq('category_id', categoryId)
        .eq('budget_id', budgetId)
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw new Error(checkError.message);
      }

      if (existingBalance) {
        // Update existing balance
        const { error: updateError } = await supabase
          .from('category_balances')
          .update({
            available: (existingBalance.available || 0) + difference
          })
          .eq('id', existingBalance.id);

        if (updateError) {
          throw new Error(updateError.message);
        }
      } else {
        // Create new balance record with the difference as available
        const { error: createError } = await supabase
          .from('category_balances')
          .insert({
            category_id: categoryId,
            budget_id: budgetId,
            user_id: userId,
            year,
            month,
            assigned: 0,
            activity: 0,
            available: difference
          });

        if (createError) {
          throw new Error(createError.message);
        }
      }
    }
  }
}
