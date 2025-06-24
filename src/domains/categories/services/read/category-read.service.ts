import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../supabase/supabase.service';
import { CategoryResponse } from '../../dto/category.dto';

@Injectable()
export class CategoryReadService {
  constructor(
    private readonly supabaseService: SupabaseService
  ) {}

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

  /**
   * Get category balance for a specific category, year, and month
   */
  async getCategoryBalance(categoryId: string, budgetId: string, userId: string, authToken: string): Promise<any> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const { data: balance, error } = await supabase
      .from('category_balances')
      .select('assigned, activity, available')
      .eq('category_id', categoryId)
      .eq('user_id', userId)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }

    return balance;
  }
}
