import { Module } from '@nestjs/common';
import { DatabaseManagementService } from './database-management.service';
import { DatabaseManagementController } from './database-management.controller';
import { AuthModule } from '../../configurations/auth/auth.module';

@Module({
  controllers: [DatabaseManagementController],
  providers: [DatabaseManagementService],
  exports: [DatabaseManagementService],
  imports: [AuthModule],
})
export class DatabaseManagementModule {}
