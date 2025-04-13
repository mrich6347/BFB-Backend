import { Injectable } from '@nestjs/common';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { Account } from './entities/account.entity';

@Injectable()
export class AccountsService {
  private supabase: SupabaseClient;

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
  }

  async create(createAccountDto: CreateAccountDto, userId: string, authToken: string): Promise<Account> {

    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { current_balance, ...accountData } = createAccountDto;
    
    let payload = {
      ...accountData,
      user_id: userId,
      cleared_balance: current_balance,
      working_balance: current_balance
    }
    
    
    const { data, error } = await supabase
      .from('accounts')
      .insert(payload)
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  }

  findAll() {
    return `This action returns all accounts`;
  }

  findOne(id: number) {
    return `This action returns a #${id} account`;
  }

  update(id: number, updateAccountDto: UpdateAccountDto) {
    return `This action updates a #${id} account`;
  }

  remove(id: number) {
    return `This action removes a #${id} account`;
  }
}
