import { Module } from '@nestjs/common';
import { ReadyToAssignService } from './ready-to-assign.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [ReadyToAssignService],
  exports: [ReadyToAssignService],
})
export class ReadyToAssignModule {}
