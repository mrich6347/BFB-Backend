import { Controller, Get, Param, Req, UseGuards, Query, ParseIntPipe } from '@nestjs/common';
import { MainDataService } from './main-data.service';
import { AuthService } from '../configurations/auth/auth.service';
import { MainDataResponse } from './DTO/mainData.dto';
import { SupabaseAuthGuard } from '../guards/auth.guard';

@Controller('main-data')
@UseGuards(SupabaseAuthGuard)
export class MainDataController {
  constructor(private readonly mainDataService: MainDataService, private readonly authService: AuthService) {}

  @Get(':budgetId')
  async getMainData(
    @Req() req: any,
    @Param('budgetId') budgetId: string,
    @Query('year', new ParseIntPipe({ optional: true })) year: number,
    @Query('month', new ParseIntPipe({ optional: true })) month: number
  ): Promise<MainDataResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.mainDataService.getMainData(budgetId, authToken, req.user.id, year, month);
  }
}
