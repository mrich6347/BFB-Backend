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
      user_id: userId,
      assigned: 0,
      activity: 0,
      available: 0
    };

    const { data, error } = await supabase
      .from('categories')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async findAll(categoryGroupId: string, userId: string, authToken: string): Promise<CategoryResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('category_group_id', categoryGroupId)
      .eq('user_id', userId)
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async findAllByBudget(budgetId: string, userId: string, authToken: string): Promise<CategoryResponse[]> {
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

    return data;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto, userId: string, authToken: string): Promise<CategoryResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data, error } = await supabase
      .from('categories')
      .update(updateCategoryDto)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async remove(id: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
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
