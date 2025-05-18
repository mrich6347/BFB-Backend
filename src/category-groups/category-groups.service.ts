import { Injectable, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCategoryGroupDto, UpdateCategoryGroupDto, CategoryGroupResponse, ReorderCategoryGroupsDto } from './dto/category-group.dto';

@Injectable()
export class CategoryGroupsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(createCategoryGroupDto: CreateCategoryGroupDto, userId: string, authToken: string): Promise<CategoryGroupResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const payload = {
      ...createCategoryGroupDto,
      user_id: userId,
    };

    const { data, error } = await supabase
      .from('category_groups')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async findAll(budgetId: string, userId: string, authToken: string): Promise<CategoryGroupResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('category_groups')
      .select('*')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async update(id: string, updateCategoryGroupDto: UpdateCategoryGroupDto, userId: string, authToken: string): Promise<CategoryGroupResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('category_groups')
      .update(updateCategoryGroupDto)
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
      .from('category_groups')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  async reorder(reorderDto: ReorderCategoryGroupsDto, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Update display_order for each group
    for (let i = 0; i < reorderDto.group_ids.length; i++) {
      const { error } = await supabase
        .from('category_groups')
        .update({ display_order: i })
        .eq('id', reorderDto.group_ids[i])
        .eq('user_id', userId);

      if (error) {
        throw new Error(error.message);
      }
    }
  }
}
