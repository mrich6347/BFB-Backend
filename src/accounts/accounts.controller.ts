import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AuthService } from '../configurations/auth/auth.service';
import { Account } from './entities/account.entity';
import { SupabaseAuthGuard } from '../guards/auth.guard';

@Controller('accounts')
@UseGuards(SupabaseAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService, private readonly authService: AuthService) {}

  @Post()
  create(@Body() createAccountDto: CreateAccountDto, @Req() req: any): Promise<Account> {
    const authToken = this.authService.getAuthToken(req);
    return this.accountsService.create(createAccountDto, req.user.id, authToken);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAccountDto: UpdateAccountDto) {
    return this.accountsService.update(+id, updateAccountDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.accountsService.remove(+id);
  }
}
