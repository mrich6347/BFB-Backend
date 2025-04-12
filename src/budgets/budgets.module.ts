import { Module } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { BudgetsController } from './budgets.controller';
import { AuthModule } from '../configurations/auth/auth.module';

@Module({
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
  imports: [AuthModule],
})
export class BudgetsModule {}
