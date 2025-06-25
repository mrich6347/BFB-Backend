import { Module } from '@nestjs/common';
import { CategoryReadService } from './services/read/category-read.service';
import { CategoryWriteService } from './services/write/category-write.service';
import { CategoryMoneyMovementWriteService } from './services/write/category-money-movement-write.service';
import { CategoriesController } from './categories.controller';
import { AuthModule } from '../../configurations/auth/auth.module';
import { ReadyToAssignModule } from '../ready-to-assign/ready-to-assign.module';
import { CreditCardDebtModule } from '../credit-card-debt/credit-card-debt.module';

@Module({
  controllers: [CategoriesController],
  providers: [CategoryReadService, CategoryWriteService, CategoryMoneyMovementWriteService],
  exports: [CategoryReadService, CategoryWriteService, CategoryMoneyMovementWriteService],
  imports: [AuthModule, ReadyToAssignModule, CreditCardDebtModule],
})
export class CategoriesModule {}
