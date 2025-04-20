import { Injectable, ConflictException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { BudgetResponse, CreateBudgetDto, UpdateBudgetDto } from './DTO/budget.dto';
import { SupabaseService } from '../supabase/supabase.service';

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
       console.log("ERROR", error);
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

    await this.checkForExistingBudget(createBudgetDto.name, userId, authToken);

    const { data, error } = await supabase
      .from('budgets')
      .insert([payload])
      .select('currency, currency_placement, date_format, id, name, number_format, updated_at')
      .single();

    if (error) {
      console.log("ERROR", error)
      throw new Error(error.message);
    }

    return data;
  }

  async update(id: string, updateBudgetDto: UpdateBudgetDto, userId: string, authToken: string): Promise<BudgetResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    if (updateBudgetDto.name) {
      await this.checkForExistingBudget(updateBudgetDto.name, userId, authToken);
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

  async checkForExistingBudget(name: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('budgets')
      .select('id')
      .ilike('name', name)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      throw new ConflictException(`A budget already exists with the name '${name}'`);
    }
  }
}
