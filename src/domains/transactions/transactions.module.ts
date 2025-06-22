import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AuthModule } from '../../configurations/auth/auth.module';
import { CategoryBalancesModule } from '../category-balances/category-balances.module';
import { CategoriesModule } from '../categories/categories.module';
import { CreditCardDebtModule } from '../credit-card-debt/credit-card-debt.module';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
  imports: [AuthModule, CategoryBalancesModule, CategoriesModule, CreditCardDebtModule],
  exports: [TransactionsService],
})
export class TransactionsModule {}
