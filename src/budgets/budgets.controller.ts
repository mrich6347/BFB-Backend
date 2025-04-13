import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { BudgetResponse, CreateBudgetDto } from './DTO/budget.dto';
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.budgetsService.remove(+id);
  }

}
