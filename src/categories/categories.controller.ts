import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query, ParseUUIDPipe } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryResponse, ReorderCategoriesDto } from './dto/category.dto';
import { SupabaseAuthGuard } from '../guards/auth.guard';
import { AuthService } from '../configurations/auth/auth.service';

@Controller('categories')
@UseGuards(SupabaseAuthGuard)
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async create(@Body() createCategoryDto: CreateCategoryDto, @Req() req: any): Promise<CategoryResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoriesService.create(createCategoryDto, req.user.id, authToken);
  }

  @Get()
  async findAll(@Query('categoryGroupId', new ParseUUIDPipe()) categoryGroupId: string, @Req() req: any): Promise<CategoryResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoriesService.findAll(categoryGroupId, req.user.id, authToken);
  }

  @Get('budget/:budgetId')
  async findAllByBudget(@Param('budgetId', new ParseUUIDPipe()) budgetId: string, @Req() req: any): Promise<CategoryResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoriesService.findAllByBudget(budgetId, req.user.id, authToken);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @Req() req: any
  ): Promise<CategoryResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoriesService.update(id, updateCategoryDto, req.user.id, authToken);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoriesService.remove(id, req.user.id, authToken);
  }

  @Post('reorder')
  async reorder(@Body() reorderDto: ReorderCategoriesDto, @Req() req: any): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoriesService.reorder(reorderDto, req.user.id, authToken);
  }
}
