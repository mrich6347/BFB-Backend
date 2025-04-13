import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabaseUrl: string;
  private supabaseKey: string;
  private authenticatedClients: Map<string, SupabaseClient> = new Map();

  constructor(private configService: ConfigService) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';
    this.supabaseKey = this.configService.get<string>('SUPABASE_KEY') || '';
  }

  get client(): SupabaseClient {
    return createClient(this.supabaseUrl, this.supabaseKey);
  }

  getAuthenticatedClient(token: string): SupabaseClient {
    // Check if we already have a client for this token
    if (!this.authenticatedClients.has(token)) {
      // Create and cache a new client with custom authorization header
      const client = createClient(this.supabaseUrl, this.supabaseKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      });
      this.authenticatedClients.set(token, client);
    }
    
    // Return the cached client
    return this.authenticatedClients.get(token)!;
  }
}