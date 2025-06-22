import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { YnabCsvParser, ParsedYnabData, YnabCategoryGroup, YnabCategory } from '../../utils/ynabCsvParser';
import { CreateCategoryGroupDto, CategoryGroupResponse } from '../../domains/category-groups/dto/category-group.dto';
import { CreateCategoryDto } from '../../domains/categories/dto/category.dto';

export interface CategoryImportResult {
  categoryGroupsCount: number;
  categoriesCount: number;
  categoryGroups: CategoryGroupResponse[];
}

@Injectable()
export class YnabCategoryImportService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Import categories and category groups from parsed YNAB data
   */
  async importCategoriesAndGroups(
    parsedData: ParsedYnabData,
    budgetId: string,
    userId: string,
    authToken: string
  ): Promise<CategoryImportResult> {
    // Clean up default categories created by trigger (keep system groups)
    await this.cleanupDefaultCategoriesAfterBudgetCreation(budgetId, userId, authToken);

    // Create category groups (using existing system groups where applicable)
    const createdGroups = await this.createCategoryGroups(
      parsedData.categoryGroups,
      budgetId,
      userId,
      authToken
    );

    // Create categories
    const createdCategories = await this.createCategories(
      parsedData.categories,
      createdGroups,
      budgetId,
      userId,
      authToken
    );

    return {
      categoryGroupsCount: createdGroups.length,
      categoriesCount: createdCategories.length,
      categoryGroups: createdGroups
    };
  }

  /**
   * Clean up default categories created by database trigger immediately after budget creation
   * This removes only the default non-system groups but keeps system groups like "Hidden Categories"
   */
  private async cleanupDefaultCategoriesAfterBudgetCreation(
    budgetId: string,
    userId: string,
    authToken: string
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    try {
      // Get all non-system category groups created by the trigger
      const { data: allGroups, error: groupsError } = await supabase
        .from('category_groups')
        .select('id, name, is_system_group')
        .eq('budget_id', budgetId)
        .eq('user_id', userId);

      if (groupsError) {
        console.warn('Error fetching category groups for cleanup:', groupsError);
        return;
      }

      if (!allGroups || allGroups.length === 0) {
        return;
      }

      // Only delete specific default non-system groups, keep system groups
      const defaultGroupsToDelete = allGroups.filter(group => 
        !group.is_system_group && [
          'Monthly Bills',
          'Everyday Expenses', 
          'Savings Goals'
        ].includes(group.name)
      );

      // Delete categories and groups for default non-system groups only
      for (const group of defaultGroupsToDelete) {
        // Get all categories in this group
        const { data: categories } = await supabase
          .from('categories')
          .select('id')
          .eq('category_group_id', group.id);

        if (categories && categories.length > 0) {
          const categoryIds = categories.map(cat => cat.id);

          // Delete category balances first (foreign key constraint)
          await supabase
            .from('category_balances')
            .delete()
            .in('category_id', categoryIds);

          // Delete categories
          await supabase
            .from('categories')
            .delete()
            .in('id', categoryIds);
        }

        // Delete the category group
        await supabase
          .from('category_groups')
          .delete()
          .eq('id', group.id);
      }

      console.log(`Cleaned up ${defaultGroupsToDelete.length} default category groups for YNAB import, kept system groups`);
    } catch (error) {
      console.warn('Error during default categories cleanup:', error);
      // Don't throw error - this is cleanup, not critical for import success
    }
  }

  /**
   * Create category groups from parsed data, using existing system groups where applicable
   */
  private async createCategoryGroups(
    groups: YnabCategoryGroup[],
    budgetId: string,
    userId: string,
    authToken: string
  ): Promise<CategoryGroupResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    const allGroups: CategoryGroupResponse[] = [];

    // First, get existing system groups that were created by the trigger
    const { data: existingGroups } = await supabase
      .from('category_groups')
      .select('*')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .eq('is_system_group', true);

    // Add existing system groups to our list
    if (existingGroups) {
      allGroups.push(...existingGroups);
    }

    // Create new groups for non-system groups that don't already exist
    for (const group of groups) {
      try {
        // Check if this is a system group that already exists
        const existingSystemGroup = existingGroups?.find(existing => 
          existing.name === group.name && existing.is_system_group
        );

        if (existingSystemGroup) {
          console.log(`Using existing system group: ${group.name}`);
          continue; // Skip creating, we already have it in allGroups
        }

        // Create new group (either non-system or system group that doesn't exist)
        const groupDto: CreateCategoryGroupDto = {
          name: group.name,
          budget_id: budgetId,
          display_order: group.displayOrder
        };

        const { data, error } = await supabase
          .from('category_groups')
          .insert([{ ...groupDto, user_id: userId }])
          .select('*')
          .single();

        if (error) {
          console.warn(`Failed to create category group "${group.name}":`, error.message);
          continue;
        }

        allGroups.push(data);
      } catch (error) {
        console.warn(`Error creating category group "${group.name}":`, error);
      }
    }

    return allGroups;
  }

  /**
   * Create categories from parsed data
   */
  private async createCategories(
    categories: YnabCategory[],
    createdGroups: CategoryGroupResponse[],
    budgetId: string,
    userId: string,
    authToken: string
  ): Promise<any[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    const createdCategories: any[] = [];

    // Create a map for quick group lookup
    const groupMap = new Map<string, string>();
    createdGroups.forEach(group => {
      groupMap.set(group.name, group.id);
      console.log(`Group mapping: "${group.name}" -> ${group.id} (system: ${group.is_system_group})`);
    });

    for (const category of categories) {
      try {
        const groupId = groupMap.get(category.categoryGroupName);
        if (!groupId) {
          console.warn(`Category group not found for category "${category.name}" in group "${category.categoryGroupName}"`);
          continue;
        }

        // For system groups, we should still create categories from YNAB import
        // Only skip if this is a credit card payment category (auto-created by triggers)
        const group = createdGroups.find(g => g.id === groupId);
        if (group?.is_system_group && group.name === 'Credit Card Payments') {
          console.log(`Skipping auto-created credit card payment category "${category.name}"`);
          continue;
        }

        // Log when we're creating a category in a system group (like Hidden Categories)
        if (group?.is_system_group) {
          console.log(`Creating category "${category.name}" in system group "${group.name}"`);
        }

        const categoryDto: CreateCategoryDto = {
          name: category.name,
          category_group_id: groupId,
          budget_id: budgetId,
          display_order: category.displayOrder
        };

        const { data, error } = await supabase
          .from('categories')
          .insert([{ ...categoryDto, user_id: userId }])
          .select('*')
          .single();

        if (error) {
          console.warn(`Failed to create category "${category.name}":`, error.message);
          continue;
        }

        createdCategories.push(data);
      } catch (error) {
        console.warn(`Error creating category "${category.name}":`, error);
      }
    }

    return createdCategories;
  }
}
