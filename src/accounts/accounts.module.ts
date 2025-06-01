import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { AuthModule } from '../configurations/auth/auth.module';
import { ReadyToAssignModule } from '../ready-to-assign/ready-to-assign.module';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
  imports: [AuthModule, ReadyToAssignModule],
  exports: [AccountsService],
})
export class AccountsModule {}
