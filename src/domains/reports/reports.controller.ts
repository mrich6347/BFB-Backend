import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { SupabaseAuthGuard } from '../../guards/auth.guard';
import { AuthService } from '../../configurations/auth/auth.service';
import type {
  CategorySpendingResponse,
  SpendingOverTimeResponse,
  TopPayeesResponse,
  CategoryBreakdownResponse,
  ReportsQueryDto
} from './dto/reports.dto';

@Controller('reports')
@UseGuards(SupabaseAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly authService: AuthService
  ) {}

  @Get('top-spending-categories')
  async getTopSpendingCategories(
    @Query() query: ReportsQueryDto,
    @Req() req: any
  ): Promise<CategorySpendingResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.reportsService.getTopSpendingCategories(query, req.user.id, authToken);
  }

  @Get('spending-over-time')
  async getSpendingOverTime(
    @Query() query: ReportsQueryDto,
    @Req() req: any
  ): Promise<SpendingOverTimeResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.reportsService.getSpendingOverTime(query, req.user.id, authToken);
  }

  @Get('top-payees')
  async getTopPayees(
    @Query() query: ReportsQueryDto,
    @Req() req: any
  ): Promise<TopPayeesResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.reportsService.getTopPayees(query, req.user.id, authToken);
  }

  @Get('category-breakdown')
  async getCategoryBreakdown(
    @Query() query: ReportsQueryDto,
    @Req() req: any
  ): Promise<CategoryBreakdownResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.reportsService.getCategoryBreakdown(query, req.user.id, authToken);
  }

  @Get('top-spending-category-groups')
  async getTopSpendingCategoryGroups(
    @Query() query: ReportsQueryDto,
    @Req() req: any
  ): Promise<any> {
    const authToken = this.authService.getAuthToken(req);
    return this.reportsService.getTopSpendingCategoryGroups(query, req.user.id, authToken);
  }

  @Get('category-group-breakdown')
  async getCategoryGroupBreakdown(
    @Query() query: ReportsQueryDto,
    @Req() req: any
  ): Promise<any> {
    const authToken = this.authService.getAuthToken(req);
    return this.reportsService.getCategoryGroupBreakdown(query, req.user.id, authToken);
  }
}

