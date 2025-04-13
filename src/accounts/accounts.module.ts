import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { AuthModule } from '../configurations/auth/auth.module';
@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
  imports: [AuthModule],
})
export class AccountsModule {}
