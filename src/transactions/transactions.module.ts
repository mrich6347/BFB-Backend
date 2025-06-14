import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AuthModule } from '../configurations/auth/auth.module';
import { CategoryBalancesModule } from '../category-balances/category-balances.module';
import { DebtTrackingModule } from '../debt-tracking/debt-tracking.module';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
  imports: [AuthModule, CategoryBalancesModule, DebtTrackingModule],
  exports: [TransactionsService],
})
export class TransactionsModule {}
