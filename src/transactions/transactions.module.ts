import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AuthModule } from '../configurations/auth/auth.module';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
  imports: [AuthModule],
  exports: [TransactionsService],
})
export class TransactionsModule {}
