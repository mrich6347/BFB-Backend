import { Module } from '@nestjs/common';
import { MainDataService } from './main-data.service';
import { MainDataController } from './main-data.controller';
import { AuthModule } from '../configurations/auth/auth.module';
import { BudgetsModule } from '../budgets/budgets.module';

@Module({
  controllers: [MainDataController],
  providers: [MainDataService],
  imports: [AuthModule, BudgetsModule],
})
export class MainDataModule {}
