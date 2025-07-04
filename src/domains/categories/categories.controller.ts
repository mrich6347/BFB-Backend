import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req, Query, ParseUUIDPipe, ParseIntPipe } from '@nestjs/common';
import { CategoryReadService } from './services/read/category-read.service';
import { CategoryWriteService } from './services/write/category-write.service';
import { CategoryMoneyMovementWriteService } from './services/write/category-money-movement-write.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryResponse, ReorderCategoriesDto, MoveMoneyDto, PullFromReadyToAssignDto, CategoryWithReadyToAssignResponse, CategoryUpdateWithAffectedCategoriesResponse, UnhideCategoryDto } from './dto/category.dto';
import { SupabaseAuthGuard } from '../../guards/auth.guard';
import { AuthService } from '../../configurations/auth/auth.service';

@Controller('categories')
@UseGuards(SupabaseAuthGuard)
export class CategoriesController {
  constructor(
    private readonly categoryReadService: CategoryReadService,
    private readonly categoryWriteService: CategoryWriteService,
    private readonly categoryMoneyMovementWriteService: CategoryMoneyMovementWriteService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async create(@Body() createCategoryDto: CreateCategoryDto, @Req() req: any): Promise<CategoryWithReadyToAssignResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryWriteService.create(createCategoryDto, req.user.id, authToken);
  }

  @Get()
  async findAll(
    @Query('categoryGroupId', new ParseUUIDPipe()) categoryGroupId: string,
    @Query('year', new ParseIntPipe({ optional: true })) year: number,
    @Query('month', new ParseIntPipe({ optional: true })) month: number,
    @Req() req: any
  ): Promise<CategoryResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryReadService.findAll(categoryGroupId, req.user.id, authToken, year, month);
  }

  @Get('budget/:budgetId')
  async findAllByBudget(
    @Param('budgetId', new ParseUUIDPipe()) budgetId: string,
    @Query('year', new ParseIntPipe({ optional: true })) year: number,
    @Query('month', new ParseIntPipe({ optional: true })) month: number,
    @Req() req: any
  ): Promise<CategoryResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryReadService.findAllByBudget(budgetId, req.user.id, authToken, year, month);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @Req() req: any,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
    @Query('month', new ParseIntPipe({ optional: true })) month?: number
  ): Promise<CategoryUpdateWithAffectedCategoriesResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryWriteService.updateWithAffectedCategories(id, updateCategoryDto, req.user.id, authToken, year, month);
  }

  @Patch(':id/hide')
  async hide(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any): Promise<{ readyToAssign: number }> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryWriteService.hide(id, req.user.id, authToken);
  }

  @Patch(':id/unhide')
  async unhide(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() unhideCategoryDto: UnhideCategoryDto,
    @Req() req: any
  ): Promise<{ readyToAssign: number }> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryWriteService.unhide(id, req.user.id, authToken, unhideCategoryDto.targetGroupId);
  }

  @Post('reorder')
  async reorder(@Body() reorderDto: ReorderCategoriesDto, @Req() req: any): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryWriteService.reorder(reorderDto, req.user.id, authToken);
  }

  @Post('move-money')
  async moveMoney(@Body() moveMoneyDto: MoveMoneyDto, @Req() req: any): Promise<{ readyToAssign: number; sourceCategoryBalance: any; destinationCategoryBalance: any }> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryMoneyMovementWriteService.moveMoney(
      moveMoneyDto.sourceCategoryId,
      moveMoneyDto.destinationCategoryId,
      moveMoneyDto.amount,
      moveMoneyDto.year,
      moveMoneyDto.month,
      req.user.id,
      authToken
    );
  }

  @Post('move-money-to-ready-to-assign')
  async moveMoneyToReadyToAssign(@Body() moveMoneyDto: Omit<MoveMoneyDto, 'destinationCategoryId'>, @Req() req: any): Promise<CategoryUpdateWithAffectedCategoriesResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryMoneyMovementWriteService.moveMoneyToReadyToAssign(
      moveMoneyDto.sourceCategoryId,
      moveMoneyDto.amount,
      moveMoneyDto.year,
      moveMoneyDto.month,
      req.user.id,
      authToken
    );
  }

  @Post('pull-from-ready-to-assign')
  async pullFromReadyToAssign(@Body() pullFromReadyToAssignDto: PullFromReadyToAssignDto, @Req() req: any): Promise<CategoryUpdateWithAffectedCategoriesResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryMoneyMovementWriteService.pullFromReadyToAssign(
      pullFromReadyToAssignDto.destinationCategoryId,
      pullFromReadyToAssignDto.amount,
      pullFromReadyToAssignDto.year,
      pullFromReadyToAssignDto.month,
      req.user.id,
      authToken
    );
  }
}
