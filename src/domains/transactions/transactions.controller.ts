import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query, ParseUUIDPipe } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto, UpdateTransactionDto, TransactionResponse, TransactionWithAccountsResponse, TransactionDeleteResponse, TransactionWithReadyToAssignResponse, TransactionWithAccountsAndReadyToAssignResponse } from './dto/transaction.dto';
import { SupabaseAuthGuard } from '../../guards/auth.guard';
import { AuthService } from '../../configurations/auth/auth.service';

@Controller('transactions')
@UseGuards(SupabaseAuthGuard)
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async create(@Body() createTransactionDto: CreateTransactionDto, @Req() req: any): Promise<TransactionWithReadyToAssignResponse | TransactionWithAccountsAndReadyToAssignResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.transactionsService.create(createTransactionDto, req.user.id, authToken);
  }

  @Get('account/:accountId')
  async findAllByAccount(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Req() req: any
  ): Promise<TransactionResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.transactionsService.findAllByAccount(accountId, req.user.id, authToken);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<TransactionResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.transactionsService.findOne(id, req.user.id, authToken);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
    @Req() req: any
  ): Promise<TransactionResponse | TransactionWithAccountsResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.transactionsService.update(id, updateTransactionDto, req.user.id, authToken);
  }

  @Patch(':id/toggle-cleared')
  async toggleCleared(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<TransactionResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.transactionsService.toggleCleared(id, req.user.id, authToken);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<void | TransactionDeleteResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.transactionsService.remove(id, req.user.id, authToken);
  }
}
