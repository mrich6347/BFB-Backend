import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CategoriesService } from '../categories/categories.service';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';
import {
  CreateAutoAssignConfigurationDto,
  UpdateAutoAssignConfigurationDto,
  AutoAssignConfigurationResponse,
  AutoAssignConfigurationSummary,
  ApplyAutoAssignConfigurationDto
} from './dto/auto-assign.dto';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserDateContextUtils, WithUserDateContext } from '../common/interfaces/user-date-context.interface';

@Injectable()
export class AutoAssignService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly categoriesService: CategoriesService,
    private readonly readyToAssignService: ReadyToAssignService
  ) {}

  async create(createDto: CreateAutoAssignConfigurationDto, userId: string, authToken: string): Promise<AutoAssignConfigurationResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Validate that all categories belong to the user and budget
    await this.validateCategoriesOwnership(supabase, createDto.items.map(item => item.category_id), userId, createDto.budget_id);

    // Insert all configuration items
    const configItems = createDto.items.map(item => ({
      name: createDto.name,
      budget_id: createDto.budget_id,
      user_id: userId,
      category_id: item.category_id,
      amount: item.amount
    }));

    const { data, error } = await supabase
      .from('auto_assign_configurations')
      .insert(configItems)
      .select('*');

    if (error) {
      throw new Error(error.message);
    }

    return this.formatConfigurationResponse(data);
  }

  async findAllByBudget(budgetId: string, userId: string, authToken: string): Promise<AutoAssignConfigurationSummary[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('auto_assign_configurations')
      .select('name, budget_id, user_id, amount, created_at, updated_at')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .order('name')
      .order('created_at');

    if (error) {
      throw new Error(error.message);
    }

    // Group by configuration name and calculate summaries
    const configMap = new Map<string, AutoAssignConfigurationSummary>();
    
    for (const item of data) {
      const key = item.name;
      if (!configMap.has(key)) {
        configMap.set(key, {
          name: item.name,
          budget_id: item.budget_id,
          user_id: item.user_id,
          item_count: 0,
          total_amount: 0,
          created_at: item.created_at,
          updated_at: item.updated_at
        });
      }
      
      const config = configMap.get(key)!;
      config.item_count++;
      config.total_amount += parseFloat(item.amount.toString());
      
      // Keep the most recent updated_at
      if (new Date(item.updated_at) > new Date(config.updated_at)) {
        config.updated_at = item.updated_at;
      }
    }

    return Array.from(configMap.values());
  }

  async findByName(name: string, budgetId: string, userId: string, authToken: string): Promise<AutoAssignConfigurationResponse | null> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('auto_assign_configurations')
      .select('*')
      .eq('name', name)
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .order('created_at');

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return null;
    }

    return this.formatConfigurationResponse(data);
  }

  async update(name: string, budgetId: string, updateDto: UpdateAutoAssignConfigurationDto, userId: string, authToken: string): Promise<AutoAssignConfigurationResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // If updating items, validate category ownership
    if (updateDto.items) {
      await this.validateCategoriesOwnership(supabase, updateDto.items.map(item => item.category_id), userId, budgetId);
    }

    // Handle name change
    if (updateDto.name && updateDto.name !== name) {
      const { error: nameUpdateError } = await supabase
        .from('auto_assign_configurations')
        .update({ name: updateDto.name, updated_at: new Date().toISOString() })
        .eq('name', name)
        .eq('budget_id', budgetId)
        .eq('user_id', userId);

      if (nameUpdateError) {
        throw new Error(nameUpdateError.message);
      }
      
      name = updateDto.name; // Use new name for subsequent operations
    }

    // Handle items update
    if (updateDto.items) {
      // Delete existing items
      const { error: deleteError } = await supabase
        .from('auto_assign_configurations')
        .delete()
        .eq('name', name)
        .eq('budget_id', budgetId)
        .eq('user_id', userId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      // Insert new items
      const configItems = updateDto.items.map(item => ({
        name: name,
        budget_id: budgetId,
        user_id: userId,
        category_id: item.category_id,
        amount: item.amount
      }));

      const { data, error: insertError } = await supabase
        .from('auto_assign_configurations')
        .insert(configItems)
        .select('*');

      if (insertError) {
        throw new Error(insertError.message);
      }

      return this.formatConfigurationResponse(data);
    }

    // If only name was updated, fetch the updated configuration
    const updatedConfig = await this.findByName(name, budgetId, userId, authToken);
    if (!updatedConfig) {
      throw new Error('Configuration not found after update');
    }
    return updatedConfig;
  }

  async remove(name: string, budgetId: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { error } = await supabase
      .from('auto_assign_configurations')
      .delete()
      .eq('name', name)
      .eq('budget_id', budgetId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  async apply(applyDto: ApplyAutoAssignConfigurationDto, userId: string, authToken: string, userDateContext?: WithUserDateContext): Promise<{ success: boolean; appliedCount: number; readyToAssign: number; appliedCategories: { category_id: string; amount: number }[] }> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get configuration items
    const { data: configItems, error } = await supabase
      .from('auto_assign_configurations')
      .select('category_id, amount')
      .eq('name', applyDto.name)
      .eq('budget_id', applyDto.budget_id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    if (!configItems || configItems.length === 0) {
      throw new Error('Configuration not found');
    }

    // Get current month for balance updates (use user context if provided)
    const { year, month } = UserDateContextUtils.getCurrentUserDate(userDateContext);

    // Use batch update for better performance
    const result = await this.categoriesService.batchUpdateAssigned(
      configItems.map(item => ({
        category_id: item.category_id,
        amount: item.amount
      })),
      userId,
      authToken,
      year,
      month
    );

    // Calculate updated Ready to Assign only once
    const readyToAssign = await this.readyToAssignService.calculateReadyToAssign(applyDto.budget_id, userId, authToken);

    return {
      success: result.successCount > 0,
      appliedCount: result.successCount,
      readyToAssign,
      appliedCategories: result.appliedCategories
    };
  }

  private async validateCategoriesOwnership(supabase: SupabaseClient, categoryIds: string[], userId: string, budgetId: string): Promise<void> {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('id, category_group_id')
      .in('id', categoryIds)
      .eq('user_id', userId)
      .eq('budget_id', budgetId);

    if (error) {
      throw new Error(error.message);
    }

    if (!categories || categories.length !== categoryIds.length) {
      throw new Error('One or more categories do not belong to the user or budget');
    }

    // Get the Hidden Categories group for this budget
    const { data: hiddenGroup, error: hiddenGroupError } = await supabase
      .from('category_groups')
      .select('id')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .eq('name', 'Hidden Categories')
      .eq('is_system_group', true)
      .single();

    if (hiddenGroupError && hiddenGroupError.code !== 'PGRST116') {
      throw new Error(hiddenGroupError.message);
    }

    // Check if any categories are in Hidden Categories group
    if (hiddenGroup) {
      const hiddenCategories = categories.filter(cat =>
        cat.category_group_id === hiddenGroup.id
      );

      if (hiddenCategories.length > 0) {
        throw new Error('Hidden categories cannot be used in auto-assign configurations');
      }
    }
  }

  private formatConfigurationResponse(data: any[]): AutoAssignConfigurationResponse {
    if (!data || data.length === 0) {
      throw new Error('No configuration data found');
    }

    const firstItem = data[0];
    return {
      name: firstItem.name,
      budget_id: firstItem.budget_id,
      user_id: firstItem.user_id,
      items: data.map(item => ({
        id: item.id,
        category_id: item.category_id,
        amount: parseFloat(item.amount.toString()),
        created_at: item.created_at,
        updated_at: item.updated_at
      })),
      created_at: firstItem.created_at,
      updated_at: data.reduce((latest, item) => 
        new Date(item.updated_at) > new Date(latest) ? item.updated_at : latest, 
        firstItem.updated_at
      )
    };
  }
}
