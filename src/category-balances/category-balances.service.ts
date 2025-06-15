import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCategoryBalanceDto, UpdateCategoryBalanceDto, CategoryBalanceResponse } from './dto/category-balance.dto';
import { UserDateContextUtils, WithUserDateContext } from '../common/interfaces/user-date-context.interface';

@Injectable()
export class CategoryBalancesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(createCategoryBalanceDto: CreateCategoryBalanceDto, userId: string, authToken: string): Promise<CategoryBalanceResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const payload = {
      ...createCategoryBalanceDto,
      user_id: userId
    };

    const { data, error } = await supabase
      .from('category_balances')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async findByCategory(categoryId: string, year: number, month: number, userId: string, authToken: string): Promise<CategoryBalanceResponse | null> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data, error } = await supabase
      .from('category_balances')
      .select('*')
      .eq('category_id', categoryId)
      .eq('year', year)
      .eq('month', month)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No data found
      }
      throw new Error(error.message);
    }

    return data;
  }

  async findByBudgetAndMonth(budgetId: string, year: number, month: number, userId: string, authToken: string): Promise<CategoryBalanceResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('category_balances')
      .select('*')
      .eq('budget_id', budgetId)
      .eq('year', year)
      .eq('month', month)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  async findAllByBudget(budgetId: string, userId: string, authToken: string, userDateContext?: WithUserDateContext): Promise<CategoryBalanceResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get current year and month (use user context if provided)
    const { year: currentYear, month: currentMonth } = UserDateContextUtils.getCurrentUserDate(userDateContext);

    const { data, error } = await supabase
      .from('category_balances')
      .select('*')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .eq('year', currentYear)
      .eq('month', currentMonth);

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  async update(id: string, updateCategoryBalanceDto: UpdateCategoryBalanceDto, userId: string, authToken: string): Promise<CategoryBalanceResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data, error } = await supabase
      .from('category_balances')
      .update(updateCategoryBalanceDto)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async updateByCategoryAndMonth(
    categoryId: string, 
    year: number, 
    month: number, 
    updateCategoryBalanceDto: UpdateCategoryBalanceDto, 
    userId: string, 
    authToken: string
  ): Promise<CategoryBalanceResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data, error } = await supabase
      .from('category_balances')
      .update(updateCategoryBalanceDto)
      .eq('category_id', categoryId)
      .eq('year', year)
      .eq('month', month)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async createOrUpdateByCategoryAndMonth(
    categoryId: string,
    budgetId: string,
    year: number,
    month: number,
    balanceData: Partial<UpdateCategoryBalanceDto>,
    userId: string,
    authToken: string
  ): Promise<CategoryBalanceResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    // Try to find existing balance
    const existing = await this.findByCategory(categoryId, year, month, userId, authToken);
    
    if (existing) {
      // Update existing
      return this.updateByCategoryAndMonth(categoryId, year, month, balanceData, userId, authToken);
    } else {
      // Create new
      const createDto: CreateCategoryBalanceDto = {
        category_id: categoryId,
        budget_id: budgetId,
        year,
        month,
        assigned: balanceData.assigned || 0,
        activity: balanceData.activity || 0,
        available: balanceData.available || 0
      };
      return this.create(createDto, userId, authToken);
    }
  }

  async remove(id: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { error } = await supabase
      .from('category_balances')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  async removeByCategory(categoryId: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { error } = await supabase
      .from('category_balances')
      .delete()
      .eq('category_id', categoryId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  async ensureBalancesExistForMonth(budgetId: string, year: number, month: number, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get all categories for this budget
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id')
      .eq('budget_id', budgetId)
      .eq('user_id', userId);

    if (categoriesError) {
      throw new Error(categoriesError.message);
    }

    if (!categories || categories.length === 0) {
      return;
    }

    // Check which categories already have balances for this month
    const { data: existingBalances, error: balancesError } = await supabase
      .from('category_balances')
      .select('category_id')
      .eq('budget_id', budgetId)
      .eq('year', year)
      .eq('month', month)
      .eq('user_id', userId);

    if (balancesError) {
      throw new Error(balancesError.message);
    }

    const existingCategoryIds = new Set(existingBalances?.map(b => b.category_id) || []);
    const missingCategories = categories.filter(c => !existingCategoryIds.has(c.id));

    if (missingCategories.length > 0) {
      // Create missing balances
      const newBalances = missingCategories.map(category => ({
        category_id: category.id,
        budget_id: budgetId,
        user_id: userId,
        year,
        month,
        assigned: 0,
        activity: 0,
        available: 0
      }));

      const { error: insertError } = await supabase
        .from('category_balances')
        .insert(newBalances);

      if (insertError) {
        throw new Error(insertError.message);
      }
    }
  }

  async createMultiple(balances: any[], authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { error } = await supabase
      .from('category_balances')
      .insert(balances);

    if (error) {
      throw new Error(error.message);
    }
  }
}
