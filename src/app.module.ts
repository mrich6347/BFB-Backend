import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./configurations/auth/auth.module";
import { BudgetsModule } from './budgets/budgets.module';
import { SupabaseModule } from './supabase/supabase.module';
import { MainDataModule } from './main-data/main-data.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoryGroupsModule } from './category-groups/category-groups.module';
import { CategoriesModule } from './categories/categories.module';
import { CategoryBalancesModule } from './category-balances/category-balances.module';
import { DatabaseManagementModule } from './database-management/database-management.module';

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
    DatabaseManagementModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
