import { Module, forwardRef } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { AuthModule } from '../configurations/auth/auth.module';
import { ReadyToAssignModule } from '../ready-to-assign/ready-to-assign.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
  imports: [AuthModule, ReadyToAssignModule, forwardRef(() => TransactionsModule)],
  exports: [AccountsService],
})
export class AccountsModule {}
