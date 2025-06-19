import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { DatabaseManagementService } from './database-management.service';
import { SupabaseAuthGuard } from '../guards/auth.guard';
import { AuthService } from '../configurations/auth/auth.service';

@Controller('database-management')
@UseGuards(SupabaseAuthGuard)
export class DatabaseManagementController {
  constructor(
    private readonly databaseManagementService: DatabaseManagementService,
    private readonly authService: AuthService
  ) {}

  @Post('nuke')
  async nukeDatabase(@Req() req: any): Promise<{ success: boolean; message: string }> {
    const authToken = this.authService.getAuthToken(req);
    const userId = req.user.id;

    await this.databaseManagementService.nukeDatabase(userId, authToken);

    return {
      success: true,
      message: 'Database has been successfully wiped.'
    };
  }

  @Post('populate')
  async populateDatabase(@Req() req: any): Promise<{ success: boolean; message: string }> {
    const authToken = this.authService.getAuthToken(req);
    const userId = req.user.id;

    await this.databaseManagementService.populateDatabase(userId, authToken);

    return {
      success: true,
      message: 'Database has been successfully populated with sample data.'
    };
  }
}
