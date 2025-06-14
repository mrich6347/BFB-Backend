import { Module } from '@nestjs/common';
import { DebtTrackingService } from './debt-tracking.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [DebtTrackingService],
  exports: [DebtTrackingService],
})
export class DebtTrackingModule {}
