import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query, ParseUUIDPipe } from '@nestjs/common';
import { ScheduledTransactionsService } from './scheduled-transactions.service';
import { CreateScheduledTransactionDto, UpdateScheduledTransactionDto, ScheduledTransactionResponse } from './dto/scheduled-transaction.dto';
import { SupabaseAuthGuard } from '../../guards/auth.guard';
import { AuthService } from '../../configurations/auth/auth.service';

@Controller('scheduled-transactions')
@UseGuards(SupabaseAuthGuard)
export class ScheduledTransactionsController {
  constructor(
    private readonly scheduledTransactionsService: ScheduledTransactionsService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async create(
    @Body() createScheduledTransactionDto: CreateScheduledTransactionDto,
    @Req() req: any
  ): Promise<ScheduledTransactionResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.scheduledTransactionsService.create(
      createScheduledTransactionDto,
      req.user.id,
      authToken
    );
  }

  @Get('budget/:budgetId')
  async findAllByBudget(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Req() req: any
  ): Promise<ScheduledTransactionResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.scheduledTransactionsService.findAllByBudget(
      budgetId,
      req.user.id,
      authToken
    );
  }

  @Get('account/:accountId')
  async findAllByAccount(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Req() req: any
  ): Promise<ScheduledTransactionResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.scheduledTransactionsService.findAllByAccount(
      accountId,
      req.user.id,
      authToken
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any
  ): Promise<ScheduledTransactionResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.scheduledTransactionsService.findOne(
      id,
      req.user.id,
      authToken
    );
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScheduledTransactionDto: UpdateScheduledTransactionDto,
    @Req() req: any
  ): Promise<ScheduledTransactionResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.scheduledTransactionsService.update(
      id,
      updateScheduledTransactionDto,
      req.user.id,
      authToken
    );
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any
  ): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.scheduledTransactionsService.remove(
      id,
      req.user.id,
      authToken
    );
  }
}

