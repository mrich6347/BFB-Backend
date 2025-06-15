import { Controller, Get, Param, Req, UseGuards, Query, ParseIntPipe } from '@nestjs/common';
import { MainDataService } from './main-data.service';
import { AuthService } from '../configurations/auth/auth.service';
import { MainDataResponse } from './DTO/mainData.dto';
import { SupabaseAuthGuard } from '../guards/auth.guard';
import { WithUserDateContext } from '../common/interfaces/user-date-context.interface';

@Controller('main-data')
@UseGuards(SupabaseAuthGuard)
export class MainDataController {
  constructor(private readonly mainDataService: MainDataService, private readonly authService: AuthService) {}

  @Get(':budgetId')
  async getMainData(
    @Req() req: any,
    @Param('budgetId') budgetId: string,
    @Query('userDate') userDate?: string,
    @Query('userYear') userYear?: number,
    @Query('userMonth') userMonth?: number
  ): Promise<MainDataResponse> {
    const authToken = this.authService.getAuthToken(req);
    const userDateContext: WithUserDateContext = { userDate, userYear, userMonth };
    return this.mainDataService.getMainData(budgetId, authToken, req.user.id, userDateContext);
  }
}
