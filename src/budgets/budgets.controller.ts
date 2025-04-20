import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, UnauthorizedException, ParseUUIDPipe } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { BudgetResponse, CreateBudgetDto, UpdateBudgetDto } from './DTO/budget.dto';
import { SupabaseAuthGuard } from '../guards/auth.guard';
import { AuthService } from '../configurations/auth/auth.service';


@Controller('budgets')
@UseGuards(SupabaseAuthGuard)
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService, private readonly authService: AuthService) {}

  @Post()
  async create(@Body() createBudgetDto: CreateBudgetDto, @Req() req: any): Promise<BudgetResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.budgetsService.create(createBudgetDto, req.user.id, authToken);
  }

  @Get()
  async findAll(@Req() req: any): Promise<BudgetResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.budgetsService.findAll(req.user.id, authToken);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const authToken = this.authService.getAuthToken(req);
    return this.budgetsService.findOne(id, req.user.id, authToken);
  }

  @Patch(':id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() updateBudgetDto: UpdateBudgetDto, @Req() req: any) {
    const authToken = this.authService.getAuthToken(req);
    return this.budgetsService.update(id, updateBudgetDto, req.user.id, authToken);
  }
}
