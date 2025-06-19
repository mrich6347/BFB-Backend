import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountResponse, CreateAccountDto, AccountWithReadyToAssignResponse, ReconcileAccountDto, ReconcileAccountResponse, UpdateAccountDto, CloseAccountResponse, UpdateTrackingBalanceDto, BalanceHistoryPoint } from './DTO/account.dto';
import { AuthService } from '../../configurations/auth/auth.service';
import { SupabaseAuthGuard } from '../../guards/auth.guard';

@Controller('accounts')
@UseGuards(SupabaseAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService, private readonly authService: AuthService) {}

  @Post()
  create(@Body() createAccountDto: CreateAccountDto, @Req() req: any): Promise<AccountWithReadyToAssignResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.create(createAccountDto, req.user.id, authToken);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<AccountResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.findOne(id, req.user.id, authToken);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAccountDto: UpdateAccountDto,
    @Req() req: any
  ): Promise<AccountWithReadyToAssignResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.update(id, updateAccountDto, req.user.id, authToken);
  }

  @Delete(':id')
  close(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<CloseAccountResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.close(id, req.user.id, authToken);
  }

  @Post(':id/reopen')
  reopen(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<AccountWithReadyToAssignResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.reopen(id, req.user.id, authToken);
  }

  @Post(':id/reconcile')
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reconcileAccountDto: ReconcileAccountDto,
    @Req() req: any
  ): Promise<ReconcileAccountResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.reconcileAccount(id, reconcileAccountDto, req.user.id, authToken);
  }

  @Post(':id/update-balance')
  updateTrackingBalance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateBalanceDto: UpdateTrackingBalanceDto,
    @Req() req: any
  ): Promise<AccountWithReadyToAssignResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.updateTrackingBalance(id, updateBalanceDto.new_balance, updateBalanceDto.memo || '', req.user.id, authToken);
  }

  @Get(':id/balance-history')
  getBalanceHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any
  ): Promise<BalanceHistoryPoint[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.getBalanceHistory(id, req.user.id, authToken);
  }

  @Get(':id/transfer-options')
  getTransferOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any
  ): Promise<AccountResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.getTransferOptions(id, req.user.id, authToken);
  }
}
