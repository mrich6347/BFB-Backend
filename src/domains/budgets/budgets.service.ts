import { Injectable, ConflictException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { BudgetResponse, CreateBudgetDto, UpdateBudgetDto } from './DTO/budget.dto';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class BudgetsService {
  private supabase: SupabaseClient;

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
  }

  async findOne(id: string, userId: string, authToken: string): Promise<BudgetResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
 
    const { data, error } = await supabase
       .from('budgets')
       .select('id, currency, currency_placement, date_format, id, name, number_format, updated_at')
       .eq('id', id)
       .eq('user_id', userId)
       .single();  
 
     if (error) {
       console.log("ERROR finding budget:", error, "Budget ID:", id, "User ID:", userId);
       throw new Error(error.message);
     }
     return data;
   }

  async findAll(userId: string, authToken: string): Promise<BudgetResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data, error } = await supabase
      .from('budgets')
      .select('currency, currency_placement, date_format, id, name, number_format, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log("ERROR", error);
      throw new Error(error.message);
    }

    return data;
  }


  async create(createBudgetDto: CreateBudgetDto, userId: string, authToken: string): Promise<BudgetResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    let payload = {
      ...createBudgetDto,
      user_id: userId,
    }

    await this.checkForExistingBudgetByName(createBudgetDto.name, userId, authToken);

    const { data, error } = await supabase
      .from('budgets')
      .insert([payload])
      .select('currency, currency_placement, date_format, id, name, number_format, updated_at')
      .single();

    if (error) {
      console.log("ERROR", error)
      throw new Error(error.message);
    }

    // Wait for the trigger to complete by checking if default categories were created
    // This ensures the trigger has finished executing before we return
    await this.waitForDefaultCategories(supabase, data.id, userId);

    return data;
  }

  private async waitForDefaultCategories(supabase: any, budgetId: string, userId: string): Promise<void> {
    const maxAttempts = 10;
    const delayMs = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { data: categories, error } = await supabase
        .from('categories')
        .select('id')
        .eq('budget_id', budgetId)
        .eq('user_id', userId)
        .limit(1);

      if (!error && categories && categories.length > 0) {
        // Categories exist, trigger has completed
        return;
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // If we get here, something might be wrong, but don't fail the budget creation
    console.warn(`Default categories not found after ${maxAttempts} attempts for budget ${budgetId}`);
  }

  async update(id: string, updateBudgetDto: UpdateBudgetDto, userId: string, authToken: string): Promise<BudgetResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    if (updateBudgetDto.name) {
      await this.checkForExistingBudgetByName(updateBudgetDto.name, userId, authToken);
    }

    const { data, error } = await supabase
      .from('budgets')
      .update(updateBudgetDto)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, currency, currency_placement, date_format, id, name, number_format, updated_at')
      .single();

    if (error) {
      console.log("ERROR", error);
      throw new Error(error.message);
    }

    return data;
  }

  async checkForExistingBudgetByName(name: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('budgets')
      .select('id, name')
      .ilike('name', name)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    if (data && data.length > 0 && data[0].name !== name) {
      throw new ConflictException(`A budget already exists with the name '${name}'`);
    }
  }
}
