import { Module } from '@nestjs/common';
import { SharedGoalsService } from './shared-goals.service';
import { SharedGoalsController } from './shared-goals.controller';
import { AuthModule } from '../../configurations/auth/auth.module';

@Module({
  controllers: [SharedGoalsController],
  providers: [SharedGoalsService],
  exports: [SharedGoalsService],
  imports: [AuthModule],
})
export class SharedGoalsModule {}
