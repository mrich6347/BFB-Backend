import { Injectable } from '@nestjs/common';
import { PayeeResponse, UpsertPayeeDto } from './dto/payee.dto';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class PayeesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Normalize a payee name for comparison (lowercase, trimmed)
   */
  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  /**
   * Get all payees for a budget
   */
  async findByBudget(budgetId: string, userId: string, authToken: string): Promise<PayeeResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('payees')
      .select('*')
      .eq('user_id', userId)
      .eq('budget_id', budgetId)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Upsert a payee (create if doesn't exist, update if exists)
   * This is called when a transaction is created/updated with a payee
   */
  async upsert(dto: UpsertPayeeDto, userId: string, authToken: string): Promise<PayeeResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    const normalizedName = this.normalizeName(dto.name);

    // Check if payee already exists
    const { data: existing, error: findError } = await supabase
      .from('payees')
      .select('*')
      .eq('user_id', userId)
      .eq('budget_id', dto.budget_id)
      .eq('normalized_name', normalizedName)
      .maybeSingle();

    if (findError) {
      throw new Error(findError.message);
    }

    if (existing) {
      // Update existing payee
      const { data, error } = await supabase
        .from('payees')
        .update({
          name: dto.name, // Update the display name in case capitalization changed
          last_category_id: dto.last_category_id ?? existing.last_category_id,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } else {
      // Create new payee
      const { data, error } = await supabase
        .from('payees')
        .insert({
          user_id: userId,
          budget_id: dto.budget_id,
          name: dto.name,
          normalized_name: normalizedName,
          last_category_id: dto.last_category_id ?? null,
          last_used_at: new Date().toISOString(),
          is_transfer: dto.is_transfer ?? false,
        })
        .select('*')
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    }
  }
}

