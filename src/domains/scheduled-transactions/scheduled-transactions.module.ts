import { Module } from '@nestjs/common';
import { ScheduledTransactionsService } from './scheduled-transactions.service';
import { ScheduledTransactionsController } from './scheduled-transactions.controller';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AuthModule } from '../../configurations/auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [ScheduledTransactionsController],
  providers: [ScheduledTransactionsService],
  exports: [ScheduledTransactionsService],
})
export class ScheduledTransactionsModule {}

