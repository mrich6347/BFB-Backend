import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { MainDataService } from './main-data.service';
import { AuthService } from '../configurations/auth/auth.service';
import { MainDataResponse } from './DTO/mainData.dto';
import { SupabaseAuthGuard } from '../guards/auth.guard';

@Controller('main-data')
@UseGuards(SupabaseAuthGuard)
export class MainDataController {
  constructor(private readonly mainDataService: MainDataService, private readonly authService: AuthService) {}

  @Get(':budgetId')
  async getMainData(@Req() req: any, @Param('budgetId') budgetId: string): Promise<MainDataResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.mainDataService.getMainData(budgetId, authToken, req.user.id);
  }
}
