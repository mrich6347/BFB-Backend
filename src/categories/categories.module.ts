import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { AuthModule } from '../configurations/auth/auth.module';
import { ReadyToAssignModule } from '../ready-to-assign/ready-to-assign.module';
import { DebtTrackingModule } from '../debt-tracking/debt-tracking.module';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
  imports: [AuthModule, ReadyToAssignModule, DebtTrackingModule],
})
export class CategoriesModule {}
