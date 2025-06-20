import { Module } from '@nestjs/common';
import { SharedGoalsService } from './shared-goals.service';
import { SharedGoalsController } from './shared-goals.controller';
import { ProgressCalculationService } from './progress-calculation.service';
import { AuthModule } from '../../configurations/auth/auth.module';

@Module({
  controllers: [SharedGoalsController],
  providers: [SharedGoalsService, ProgressCalculationService],
  exports: [SharedGoalsService],
  imports: [AuthModule],
})
export class SharedGoalsModule {}
