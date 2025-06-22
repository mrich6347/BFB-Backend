import { Module } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { BudgetsController } from './budgets.controller';
import { AuthModule } from '../../configurations/auth/auth.module';
import { SupabaseModule } from '../../supabase/supabase.module';
import { YnabImportOrchestratorService } from '../../services/ynab-import/ynabImportOrchestratorService';
import { YnabCategoryImportService } from '../../services/ynab-import/ynabCategoryImportService';

@Module({
  controllers: [BudgetsController],
  providers: [BudgetsService, YnabImportOrchestratorService, YnabCategoryImportService],
  exports: [BudgetsService],
  imports: [AuthModule, SupabaseModule],
})
export class BudgetsModule {}
