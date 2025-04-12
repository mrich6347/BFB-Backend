import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateBudgetDto } from './DTO/budget.dto';
import { Budget } from './entities/budget.entity';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class BudgetsService {
  private supabase: SupabaseClient;

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
  }


  async create(createBudgetDto: CreateBudgetDto, userId: string, authToken: string): Promise<Budget> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    let payload = {
      ...createBudgetDto,
      user_id: userId,
    }
    
    const { data, error } = await supabase
      .from('budgets')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.log("ERROR", error)
      throw new Error(error.message);
    }

    return data;
  }

  async findAll(userId: string, authToken: string): Promise<Budget[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log("ERROR", error);
      throw new Error(error.message);
    }
    return data;
  }

  async findOne(id: string, authToken: string) {
   const supabase = this.supabaseService.getAuthenticatedClient(authToken);

   const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('id', id)
      .single();  

    if (error) {
      console.log("ERROR", error);
      throw new Error(error.message);
    }
    return data;
  }

  remove(id: number) {
    return `This action removes a #${id} budget`;
  }
}
