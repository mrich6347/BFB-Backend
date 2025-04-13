import { Module } from '@nestjs/common';
import { MainDataService } from './main-data.service';
import { MainDataController } from './main-data.controller';
import { AuthModule } from '../configurations/auth/auth.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { AccountsModule } from '../accounts/accounts.module';
@Module({
  controllers: [MainDataController],
  providers: [MainDataService],
  imports: [AuthModule, BudgetsModule, AccountsModule],
})
export class MainDataModule {}
