import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { AuthModule } from '../configurations/auth/auth.module';
@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
  imports: [AuthModule],
  exports: [AccountsService],
})
export class AccountsModule {}
