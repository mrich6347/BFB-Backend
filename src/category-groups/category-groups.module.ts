import { Module } from '@nestjs/common';
import { CategoryGroupsService } from './category-groups.service';
import { CategoryGroupsController } from './category-groups.controller';
import { AuthModule } from '../configurations/auth/auth.module';

@Module({
  controllers: [CategoryGroupsController],
  providers: [CategoryGroupsService],
  exports: [CategoryGroupsService],
  imports: [AuthModule],
})
export class CategoryGroupsModule {}
