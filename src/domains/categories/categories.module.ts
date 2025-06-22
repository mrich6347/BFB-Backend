import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { AuthModule } from '../../configurations/auth/auth.module';
import { ReadyToAssignModule } from '../ready-to-assign/ready-to-assign.module';
import { CreditCardDebtModule } from '../credit-card-debt/credit-card-debt.module';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
  imports: [AuthModule, ReadyToAssignModule, CreditCardDebtModule],
})
export class CategoriesModule {}
