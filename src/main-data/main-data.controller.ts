import { Controller, Get, Param, Req } from '@nestjs/common';
import { MainDataService } from './main-data.service';
import { AuthService } from '../configurations/auth/auth.service';
import { MainDataDto } from '../budgets/dto/main-data/main-data.dto';

@Controller('main-data')
export class MainDataController {
  constructor(private readonly mainDataService: MainDataService, private readonly authService: AuthService) {}

  @Get(':budgetId')
  async getMainData(@Req() req: any, @Param('budgetId') budgetId: string): Promise<MainDataDto> {
    const authToken = this.authService.getAuthToken(req);
    return this.mainDataService.getMainData(budgetId, authToken);
  }
}
