import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(private configService: ConfigService) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';
    this.supabaseKey = this.configService.get<string>('SUPABASE_KEY') || '';
  }

  get client(): SupabaseClient {
    return createClient(this.supabaseUrl, this.supabaseKey);
  }

  getAuthenticatedClient(token: string): SupabaseClient {
    // Create a new client with custom authorization header
    return createClient(this.supabaseUrl, this.supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
  }
}