import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./configurations/auth/auth.module";
import { BudgetsModule } from './budgets/budgets.module';
import { SupabaseModule } from './supabase/supabase.module';
import { MainDataModule } from './main-data/main-data.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    BudgetsModule,
    SupabaseModule,
    MainDataModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
