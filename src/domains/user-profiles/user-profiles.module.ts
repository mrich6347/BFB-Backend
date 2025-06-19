import { Module } from '@nestjs/common';
import { UserProfilesService } from './user-profiles.service';
import { UserProfilesController } from './user-profiles.controller';
import { AuthModule } from '../../configurations/auth/auth.module';

@Module({
  controllers: [UserProfilesController],
  providers: [UserProfilesService],
  exports: [UserProfilesService],
  imports: [AuthModule],
})
export class UserProfilesModule {}
