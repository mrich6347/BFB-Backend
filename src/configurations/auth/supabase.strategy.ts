import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';
import { SupabaseAuthStrategy } from 'nestjs-supabase-auth';

@Injectable()
export class SupabaseStrategy extends PassportStrategy(
  SupabaseAuthStrategy,
  'supabase',
) {
  public constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new Error('Missing required Supabase environment variables');
    }

    super({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY,
      supabaseOptions: {},
      extractor: ExtractJwt.fromAuthHeaderAsBearerToken(),
    } as const);
  }

  async validate(payload: any): Promise<any> {
    return super.validate(payload);
  }
} 