import { Controller, Get, Post, Body, Param, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { RetirementSettingsService } from './retirement-settings.service';
import { RetirementSettingsResponse, UpsertRetirementSettingsDto } from './dto/retirement-settings.dto';
import { AuthService } from '../../configurations/auth/auth.service';
import { SupabaseAuthGuard } from '../../guards/auth.guard';

@Controller('budgets/:budgetId/retirement-settings')
@UseGuards(SupabaseAuthGuard)
export class RetirementSettingsController {
  constructor(
    private readonly retirementSettingsService: RetirementSettingsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async getRetirementSettings(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Req() req: any,
  ): Promise<RetirementSettingsResponse | null> {
    const authToken = this.authService.getAuthToken(req);
    const userId = req.user.id;

    return this.retirementSettingsService.getRetirementSettings(budgetId, userId, authToken);
  }

  @Post()
  async upsertRetirementSettings(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Body() dto: UpsertRetirementSettingsDto,
    @Req() req: any,
  ): Promise<RetirementSettingsResponse> {
    const authToken = this.authService.getAuthToken(req);
    const userId = req.user.id;

    return this.retirementSettingsService.upsertRetirementSettings(budgetId, userId, dto, authToken);
  }
}

