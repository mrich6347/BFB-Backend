import { Module } from '@nestjs/common';
import { RetirementSettingsController } from './retirement-settings.controller';
import { RetirementSettingsService } from './retirement-settings.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AuthModule } from '../../configurations/auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [RetirementSettingsController],
  providers: [RetirementSettingsService],
  exports: [RetirementSettingsService],
})
export class RetirementSettingsModule {}

