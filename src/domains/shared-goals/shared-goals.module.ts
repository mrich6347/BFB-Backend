import { Module } from '@nestjs/common';
import { SharedGoalsService } from './shared-goals.service';
import { SharedGoalsCollaborationService } from './shared-goals-collaboration.service';
import { SharedGoalsController } from './shared-goals.controller';
import { ProgressCalculationService } from './progress-calculation.service';
import { AuthModule } from '../../configurations/auth/auth.module';

@Module({
  controllers: [SharedGoalsController],
  providers: [SharedGoalsService, SharedGoalsCollaborationService, ProgressCalculationService],
  exports: [SharedGoalsService, SharedGoalsCollaborationService],
  imports: [AuthModule],
})
export class SharedGoalsModule {}
