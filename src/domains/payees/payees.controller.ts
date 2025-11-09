import { Controller, Get, Post, Body, Param, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { PayeesService } from './payees.service';
import { PayeeResponse, UpsertPayeeDto } from './dto/payee.dto';
import { AuthService } from '../../configurations/auth/auth.service';
import { SupabaseAuthGuard } from '../../guards/auth.guard';

@Controller('payees')
@UseGuards(SupabaseAuthGuard)
export class PayeesController {
  constructor(
    private readonly payeesService: PayeesService,
    private readonly authService: AuthService
  ) {}

  @Get('budget/:budgetId')
  async findByBudget(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Req() req: any
  ): Promise<PayeeResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.payeesService.findByBudget(budgetId, req.user.id, authToken);
  }

  @Post()
  async upsert(@Body() upsertPayeeDto: UpsertPayeeDto, @Req() req: any): Promise<PayeeResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.payeesService.upsert(upsertPayeeDto, req.user.id, authToken);
  }
}