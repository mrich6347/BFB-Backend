import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query, ParseUUIDPipe, ParseIntPipe } from '@nestjs/common';
import { CategoryBalancesService } from './category-balances.service';
import { CreateCategoryBalanceDto, UpdateCategoryBalanceDto, CategoryBalanceResponse } from './dto/category-balance.dto';
import { SupabaseAuthGuard } from '../guards/auth.guard';
import { AuthService } from '../configurations/auth/auth.service';

@Controller('category-balances')
@UseGuards(SupabaseAuthGuard)
export class CategoryBalancesController {
  constructor(
    private readonly categoryBalancesService: CategoryBalancesService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async create(@Body() createCategoryBalanceDto: CreateCategoryBalanceDto, @Req() req: any): Promise<CategoryBalanceResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryBalancesService.create(createCategoryBalanceDto, req.user.id, authToken);
  }

  @Get('category/:categoryId')
  async findByCategory(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Req() req: any
  ): Promise<CategoryBalanceResponse | null> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryBalancesService.findByCategory(categoryId, year, month, req.user.id, authToken);
  }

  @Get('budget/:budgetId')
  async findByBudgetAndMonth(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Req() req: any
  ): Promise<CategoryBalanceResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryBalancesService.findByBudgetAndMonth(budgetId, year, month, req.user.id, authToken);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryBalanceDto: UpdateCategoryBalanceDto,
    @Req() req: any
  ): Promise<CategoryBalanceResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryBalancesService.update(id, updateCategoryBalanceDto, req.user.id, authToken);
  }

  @Patch('category/:categoryId')
  async updateByCategoryAndMonth(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Body() updateCategoryBalanceDto: UpdateCategoryBalanceDto,
    @Req() req: any
  ): Promise<CategoryBalanceResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryBalancesService.updateByCategoryAndMonth(categoryId, year, month, updateCategoryBalanceDto, req.user.id, authToken);
  }

  @Post('ensure/:budgetId')
  async ensureBalancesExistForMonth(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Req() req: any
  ): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryBalancesService.ensureBalancesExistForMonth(budgetId, year, month, req.user.id, authToken);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryBalancesService.remove(id, req.user.id, authToken);
  }
}
