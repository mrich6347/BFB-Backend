// auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    // Initialize Supabase client
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL') || '',
      this.configService.get<string>('SUPABASE_KEY') || '',
    );
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    console.log('SupabaseAuthGuard');
    const request = context.switchToHttp().getRequest();
    return this.validateRequest(request);
  }

  async validateRequest(request: any): Promise<boolean> {
    // Extract JWT token from Authorization header
    const authHeader = request.headers.authorization;
    console.log('authHeader', authHeader);
    if (!authHeader) {
      throw new UnauthorizedException('No authorization token provided');
    }
    
    const token = authHeader.split(' ')[1]; // Assuming format: "Bearer TOKEN"
    
    if (!token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }
    
    try {
      // Verify the JWT using Supabase
      const { data, error } = await this.supabase.auth.getUser(token);
      
      if (error || !data.user) {
        throw new UnauthorizedException('Invalid token');
      }
      
      // Add user data to request for use in controllers
      request.user = data.user;
      
      return true;
    } catch (error) {
      throw new UnauthorizedException('Failed to authenticate user');
    }
  }
}