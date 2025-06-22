import { Module } from '@nestjs/common';
import { CreditCardDebtService } from './credit-card-debt.service';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [CreditCardDebtService],
  exports: [CreditCardDebtService],
})
export class CreditCardDebtModule {}
