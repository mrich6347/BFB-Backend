import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AuthModule } from '../../configurations/auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService]
})
export class ReportsModule {}

