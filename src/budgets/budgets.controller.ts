import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { SupabaseAuthGuard } from '../guards/auth.guard';
import { Budget } from './entities/budget.entity';

@Controller('budgets')
@UseGuards(SupabaseAuthGuard)
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  async create(@Body() createBudgetDto: CreateBudgetDto, @Req() req: any): Promise<Budget> {
    const authToken = req.headers.authorization?.split(' ')[1];
    if (!authToken) {
      throw new UnauthorizedException('No authorization token provided');
    }
    return this.budgetsService.create(createBudgetDto, req.user.id, authToken);
  }

  @Get()
  findAll() {
    return this.budgetsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.budgetsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBudgetDto: UpdateBudgetDto) {
    return this.budgetsService.update(+id, updateBudgetDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.budgetsService.remove(+id);
  }
}
