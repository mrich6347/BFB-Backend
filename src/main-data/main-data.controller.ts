import { Controller, Get, Req } from '@nestjs/common';
import { MainDataService } from './main-data.service';
import { AuthService } from '../configurations/auth/auth.service';

@Controller('main-data')
export class MainDataController {
  constructor(private readonly mainDataService: MainDataService, private readonly authService: AuthService) {}

  @Get()
  async getMainData(@Req() req: any): Promise<any> {
    const authToken = this.authService.getAuthToken(req);
    return this.mainDataService.getMainData(req.budgetId, authToken);
  }
}
