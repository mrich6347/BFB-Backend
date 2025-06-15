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

    // Check if this is a system group and prevent editing
    const { data: groupData, error: fetchError } = await supabase
      .from('category_groups')
      .select('is_system_group')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (groupData.is_system_group) {
      throw new Error('System category groups cannot be edited');
    }

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

    // Check if this is a system group and prevent deletion
    const { data: groupData, error: fetchError } = await supabase
      .from('category_groups')
      .select('is_system_group')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (groupData.is_system_group) {
      throw new Error('System category groups cannot be deleted');
    }

    const { error } = await supabase
      .from('category_groups')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  async hide(id: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Check if this is a system group and prevent hiding
    const { data: groupData, error: fetchError } = await supabase
      .from('category_groups')
      .select('is_system_group, budget_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (groupData.is_system_group) {
      throw new Error('System category groups cannot be hidden');
    }

    // Get the Hidden Categories group for this budget
    const { data: hiddenGroup, error: hiddenGroupError } = await supabase
      .from('category_groups')
      .select('id')
      .eq('budget_id', groupData.budget_id)
      .eq('user_id', userId)
      .eq('name', 'Hidden Categories')
      .eq('is_system_group', true)
      .single();

    if (hiddenGroupError) {
      throw new Error('Hidden Categories group not found');
    }

    // Move all categories in this group to Hidden Categories
    const { error: updateError } = await supabase
      .from('categories')
      .update({ category_group_id: hiddenGroup.id })
      .eq('category_group_id', id)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Delete the now-empty group
    const { error: deleteError } = await supabase
      .from('category_groups')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (deleteError) {
      throw new Error(deleteError.message);
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
