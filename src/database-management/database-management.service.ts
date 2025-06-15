import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class DatabaseManagementService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async nukeDatabase(userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    // Get all tables that have user data
    const tables = await this.getUserTables(supabase);
    
    // Delete data from each table for the current user
    for (const table of tables) {
      await this.clearTableForUser(supabase, table, userId);
    }
  }

  private async getUserTables(supabase: SupabaseClient): Promise<string[]> {
    // These are the tables we know have user data and should be cleared
    // The order is important to avoid foreign key constraint errors
    // Delete child tables first, then parent tables
    return [
      'transactions',           // Must be first - references accounts and categories
      'category_balances',      // References categories
      'auto_assign_configurations', // References categories and budgets
      'categories',             // References category_groups and budgets
      'category_groups',        // References budgets
      'accounts',               // References budgets
      'budgets'                 // Parent table - delete last
    ];
  }

  private async clearTableForUser(supabase: SupabaseClient, table: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('user_id', userId);
      
      if (error) {
        console.error(`Error clearing table ${table}:`, error);
        throw new Error(`Failed to clear table ${table}: ${error.message}`);
      }
    } catch (error) {
      console.error(`Error clearing table ${table}:`, error);
      throw new Error(`Failed to clear table ${table}: ${error.message}`);
    }
  }
}
