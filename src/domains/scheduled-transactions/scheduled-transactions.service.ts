import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateScheduledTransactionDto, UpdateScheduledTransactionDto, ScheduledTransactionResponse } from './dto/scheduled-transaction.dto';

@Injectable()
export class ScheduledTransactionsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(
    createScheduledTransactionDto: CreateScheduledTransactionDto,
    userId: string,
    authToken: string
  ): Promise<ScheduledTransactionResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const payload = {
      ...createScheduledTransactionDto,
      user_id: userId,
      is_active: createScheduledTransactionDto.is_active ?? true,
    };

    const { data, error } = await supabase
      .from('scheduled_transactions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async findAllByBudget(
    budgetId: string,
    userId: string,
    authToken: string
  ): Promise<ScheduledTransactionResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('scheduled_transactions')
      .select('*')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .order('payee', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  async findAllByAccount(
    accountId: string,
    userId: string,
    authToken: string
  ): Promise<ScheduledTransactionResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('scheduled_transactions')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .order('payee', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  async findOne(
    id: string,
    userId: string,
    authToken: string
  ): Promise<ScheduledTransactionResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('scheduled_transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async update(
    id: string,
    updateScheduledTransactionDto: UpdateScheduledTransactionDto,
    userId: string,
    authToken: string
  ): Promise<ScheduledTransactionResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('scheduled_transactions')
      .update(updateScheduledTransactionDto)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async remove(
    id: string,
    userId: string,
    authToken: string
  ): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { error } = await supabase
      .from('scheduled_transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }
}

