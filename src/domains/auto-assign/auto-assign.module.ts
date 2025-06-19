import { Module } from '@nestjs/common';
import { AutoAssignService } from './auto-assign.service';
import { AutoAssignController } from './auto-assign.controller';
import { SupabaseModule } from '../../supabase/supabase.module';
import { CategoriesModule } from '../categories/categories.module';
import { AuthModule } from '../../configurations/auth/auth.module';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';

@Module({
  imports: [SupabaseModule, CategoriesModule, AuthModule],
  controllers: [AutoAssignController],
  providers: [AutoAssignService, ReadyToAssignService],
  exports: [AutoAssignService]
})
export class AutoAssignModule {}
