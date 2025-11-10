import { Module } from '@nestjs/common';
import { NetWorthHistoryController } from './net-worth-history.controller';
import { NetWorthHistoryService } from './net-worth-history.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AuthModule } from '../../configurations/auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
    imports: [SupabaseModule, AuthModule, AccountsModule],
    controllers: [NetWorthHistoryController],
    providers: [NetWorthHistoryService],
    exports: [NetWorthHistoryService]
})
export class NetWorthHistoryModule {}

