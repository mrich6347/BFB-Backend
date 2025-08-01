import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Query,
  UseGuards,
  Req
} from '@nestjs/common';
import { UserProfilesService } from './user-profiles.service';
import {
  CreateUserProfileDto,
  UpdateUserProfileDto,
  UserProfileResponse,
  PublicUserProfileResponse
} from './dto/user-profile.dto';
import { SupabaseAuthGuard } from '../../guards/auth.guard';
import { AuthService } from '../../configurations/auth/auth.service';

@Controller('user-profiles')
@UseGuards(SupabaseAuthGuard)
export class UserProfilesController {
  constructor(
    private readonly userProfilesService: UserProfilesService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async create(@Body() createUserProfileDto: CreateUserProfileDto, @Req() req: any): Promise<UserProfileResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.userProfilesService.create(createUserProfileDto, req.user.id, authToken);
  }

  @Get('me')
  async getCurrentUserProfile(@Req() req: any): Promise<UserProfileResponse | null> {
    const authToken = this.authService.getAuthToken(req);
    const profile = await this.userProfilesService.findByUserId(req.user.id, authToken);

    // Return null if no profile exists yet - this is expected for new users
    return profile || null;
  }

  @Put('me')
  async updateCurrentUserProfile(
    @Body() updateUserProfileDto: UpdateUserProfileDto, 
    @Req() req: any
  ): Promise<UserProfileResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.userProfilesService.update(updateUserProfileDto, req.user.id, authToken);
  }

  @Get('search')
  async searchUsers(
    @Query('username') username: string,
    @Req() req: any
  ): Promise<PublicUserProfileResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    
    if (!username || username.trim().length === 0) {
      return [];
    }
    
    return this.userProfilesService.searchByUsername(username.trim(), authToken);
  }

  // Removed findByUsername endpoint - username availability is now checked during create/update
}
