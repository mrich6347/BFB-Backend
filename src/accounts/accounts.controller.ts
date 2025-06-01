import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountResponse, CreateAccountDto, AccountWithReadyToAssignResponse } from './DTO/account.dto';
import { AuthService } from '../configurations/auth/auth.service';
import { SupabaseAuthGuard } from '../guards/auth.guard';

@Controller('accounts')
@UseGuards(SupabaseAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService, private readonly authService: AuthService) {}

  @Post()
  create(@Body() createAccountDto: CreateAccountDto, @Req() req: any): Promise<AccountWithReadyToAssignResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.create(createAccountDto, req.user.id, authToken);
  }
}
