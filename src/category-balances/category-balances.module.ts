import { Module } from '@nestjs/common';
import { CategoryBalancesService } from './category-balances.service';
import { CategoryBalancesController } from './category-balances.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../configurations/auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [CategoryBalancesController],
  providers: [CategoryBalancesService],
  exports: [CategoryBalancesService]
})
export class CategoryBalancesModule {}
