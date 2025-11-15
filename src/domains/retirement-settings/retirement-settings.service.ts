import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RetirementSettingsResponse, UpsertRetirementSettingsDto } from './dto/retirement-settings.dto';

@Injectable()
export class RetirementSettingsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getRetirementSettings(
    budgetId: string,
    userId: string,
    authToken: string,
  ): Promise<RetirementSettingsResponse | null> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('retirement_settings')
      .select('*')
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .single();

    if (error) {
      // If no settings exist yet, return null (not an error)
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  async upsertRetirementSettings(
    budgetId: string,
    userId: string,
    dto: UpsertRetirementSettingsDto,
    authToken: string,
  ): Promise<RetirementSettingsResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const payload = {
      user_id: userId,
      budget_id: budgetId,
      monthly_contribution: dto.monthly_contribution,
      retirement_age: dto.retirement_age,
    };

    const { data, error } = await supabase
      .from('retirement_settings')
      .upsert(payload, {
        onConflict: 'user_id,budget_id',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }
}

