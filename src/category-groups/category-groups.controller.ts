import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query, ParseUUIDPipe } from '@nestjs/common';
import { CategoryGroupsService } from './category-groups.service';
import { CreateCategoryGroupDto, UpdateCategoryGroupDto, CategoryGroupResponse, ReorderCategoryGroupsDto, CategoryGroupDeleteResponse } from './dto/category-group.dto';
import { SupabaseAuthGuard } from '../guards/auth.guard';
import { AuthService } from '../configurations/auth/auth.service';

@Controller('category-groups')
@UseGuards(SupabaseAuthGuard)
export class CategoryGroupsController {
  constructor(
    private readonly categoryGroupsService: CategoryGroupsService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async create(@Body() createCategoryGroupDto: CreateCategoryGroupDto, @Req() req: any): Promise<CategoryGroupResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryGroupsService.create(createCategoryGroupDto, req.user.id, authToken);
  }

  @Get()
  async findAll(@Query('budgetId', new ParseUUIDPipe()) budgetId: string, @Req() req: any): Promise<CategoryGroupResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryGroupsService.findAll(budgetId, req.user.id, authToken);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCategoryGroupDto: UpdateCategoryGroupDto,
    @Req() req: any
  ): Promise<CategoryGroupResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryGroupsService.update(id, updateCategoryGroupDto, req.user.id, authToken);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any): Promise<CategoryGroupDeleteResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryGroupsService.remove(id, req.user.id, authToken);
  }

  @Patch(':id/hide')
  async hide(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any): Promise<CategoryGroupDeleteResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryGroupsService.hide(id, req.user.id, authToken);
  }

  @Post('reorder')
  async reorder(@Body() reorderDto: ReorderCategoryGroupsDto, @Req() req: any): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.categoryGroupsService.reorder(reorderDto, req.user.id, authToken);
  }
}
