import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';

@Injectable()
export class AuthGuard extends PassportAuthGuard('supabase') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
} 