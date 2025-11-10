import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./configurations/auth/auth.module";
import { BudgetsModule } from './domains/budgets/budgets.module';
import { SupabaseModule } from './supabase/supabase.module';
import { MainDataModule } from './domains/main-data/main-data.module';
import { AccountsModule } from './domains/accounts/accounts.module';
import { CategoryGroupsModule } from './domains/category-groups/category-groups.module';
import { CategoriesModule } from './domains/categories/categories.module';
import { CategoryBalancesModule } from './domains/category-balances/category-balances.module';
import { TransactionsModule } from './domains/transactions/transactions.module';
import { AutoAssignModule } from './domains/auto-assign/auto-assign.module';
import { UserProfilesModule } from './domains/user-profiles/user-profiles.module';
import { SharedGoalsModule } from './domains/shared-goals/shared-goals.module';
import { PayeesModule } from './domains/payees/payees.module';
import { NetWorthHistoryModule } from './domains/net-worth-history/net-worth-history.module';
import { ScheduledTransactionsModule } from './domains/scheduled-transactions/scheduled-transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    BudgetsModule,
    SupabaseModule,
    MainDataModule,
    AccountsModule,
    CategoryGroupsModule,
    CategoriesModule,
    CategoryBalancesModule,
    TransactionsModule,
    AutoAssignModule,
    UserProfilesModule,
    SharedGoalsModule,
    PayeesModule,
    NetWorthHistoryModule,
    ScheduledTransactionsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
