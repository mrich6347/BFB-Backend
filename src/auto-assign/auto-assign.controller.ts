import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query, ParseUUIDPipe } from '@nestjs/common';
import { AutoAssignService } from './auto-assign.service';
import { 
  CreateAutoAssignConfigurationDto, 
  UpdateAutoAssignConfigurationDto,
  AutoAssignConfigurationResponse,
  AutoAssignConfigurationSummary,
  ApplyAutoAssignConfigurationDto
} from './dto/auto-assign.dto';
import { SupabaseAuthGuard } from '../guards/auth.guard';
import { AuthService } from '../configurations/auth/auth.service';

@Controller('auto-assign')
@UseGuards(SupabaseAuthGuard)
export class AutoAssignController {
  constructor(
    private readonly autoAssignService: AutoAssignService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async create(@Body() createDto: CreateAutoAssignConfigurationDto, @Req() req: any): Promise<AutoAssignConfigurationResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.autoAssignService.create(createDto, req.user.id, authToken);
  }

  @Get('budget/:budgetId')
  async findAllByBudget(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Req() req: any
  ): Promise<AutoAssignConfigurationSummary[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.autoAssignService.findAllByBudget(budgetId, req.user.id, authToken);
  }

  @Get('budget/:budgetId/config/:name')
  async findByName(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Param('name') name: string,
    @Req() req: any
  ): Promise<AutoAssignConfigurationResponse | null> {
    const authToken = this.authService.getAuthToken(req);
    return this.autoAssignService.findByName(name, budgetId, req.user.id, authToken);
  }

  @Patch('budget/:budgetId/config/:name')
  async update(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Param('name') name: string,
    @Body() updateDto: UpdateAutoAssignConfigurationDto,
    @Req() req: any
  ): Promise<AutoAssignConfigurationResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.autoAssignService.update(name, budgetId, updateDto, req.user.id, authToken);
  }

  @Delete('budget/:budgetId/config/:name')
  async remove(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Param('name') name: string,
    @Req() req: any
  ): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.autoAssignService.remove(name, budgetId, req.user.id, authToken);
  }

  @Post('apply')
  async apply(
    @Body() applyDto: ApplyAutoAssignConfigurationDto,
    @Req() req: any
  ): Promise<{ success: boolean; appliedCount: number; readyToAssign: number; appliedCategories: { category_id: string; amount: number }[] }> {
    const authToken = this.authService.getAuthToken(req);
    return this.autoAssignService.apply(applyDto, req.user.id, authToken);
  }
}
