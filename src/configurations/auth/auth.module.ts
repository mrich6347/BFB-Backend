import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SupabaseStrategy } from './supabase.strategy';
import { AuthService } from './auth.service';

@Module({
  imports: [PassportModule],
  providers: [SupabaseStrategy, AuthService],
  exports: [SupabaseStrategy, AuthService],
})
export class AuthModule {} 