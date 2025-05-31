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

  async update(id: string, updateCategoryDto: UpdateCategoryDto, userId: string, authToken: string, year?: number, month?: number): Promise<CategoryResponse> {
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

      const balanceUpdate: any = {};
      if (assigned !== undefined) balanceUpdate.assigned = assigned;
      if (activity !== undefined) balanceUpdate.activity = activity;
      if (available !== undefined) balanceUpdate.available = available;

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
    }

    // Fetch and return the updated category with current balances
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);

    const { data, error } = await supabase
      .from('categories')
      .select(`
        *,
        category_balances!inner(assigned, activity, available)
      `)
      .eq('id', id)
      .eq('user_id', userId)
      .eq('category_balances.year', targetYear)
      .eq('category_balances.month', targetMonth)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return {
      ...data,
      assigned: data.category_balances[0]?.assigned || 0,
      activity: data.category_balances[0]?.activity || 0,
      available: data.category_balances[0]?.available || 0,
      category_balances: undefined
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
}
