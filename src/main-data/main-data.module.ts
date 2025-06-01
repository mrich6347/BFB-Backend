import { Module } from '@nestjs/common';
import { MainDataService } from './main-data.service';
import { MainDataController } from './main-data.controller';
import { AuthModule } from '../configurations/auth/auth.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoryGroupsModule } from '../category-groups/category-groups.module';
import { CategoriesModule } from '../categories/categories.module';
import { CategoryBalancesModule } from '../category-balances/category-balances.module';

@Module({
  controllers: [MainDataController],
  providers: [MainDataService],
  imports: [
    AuthModule,
    BudgetsModule,
    AccountsModule,
    CategoryGroupsModule,
    CategoriesModule,
    CategoryBalancesModule
  ],
})
export class MainDataModule {}
