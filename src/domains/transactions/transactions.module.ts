import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AuthModule } from '../../configurations/auth/auth.module';
import { CategoryBalancesModule } from '../category-balances/category-balances.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
  imports: [AuthModule, CategoryBalancesModule, CategoriesModule],
  exports: [TransactionsService],
})
export class TransactionsModule {}
