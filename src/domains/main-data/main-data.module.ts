import { Module } from '@nestjs/common';
import { MainDataService } from './main-data.service';
import { MainDataController } from './main-data.controller';
import { AuthModule } from '../../configurations/auth/auth.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoryGroupsModule } from '../category-groups/category-groups.module';
import { CategoriesModule } from '../categories/categories.module';
import { CategoryBalancesModule } from '../category-balances/category-balances.module';
import { ReadyToAssignModule } from '../ready-to-assign/ready-to-assign.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AutoAssignModule } from '../auto-assign/auto-assign.module';
import { UserProfilesModule } from '../user-profiles/user-profiles.module';
import { SharedGoalsModule } from '../shared-goals/shared-goals.module';
import { PayeesModule } from '../payees/payees.module';
import { ScheduledTransactionsModule } from '../scheduled-transactions/scheduled-transactions.module';

@Module({
  controllers: [MainDataController],
  providers: [MainDataService],
  imports: [
    AuthModule,
    BudgetsModule,
    AccountsModule,
    CategoryGroupsModule,
    CategoriesModule,
    CategoryBalancesModule,
    ReadyToAssignModule,
    TransactionsModule,
    AutoAssignModule,
    UserProfilesModule,
    SharedGoalsModule,
    PayeesModule,
    ScheduledTransactionsModule
  ],
})
export class MainDataModule {}
