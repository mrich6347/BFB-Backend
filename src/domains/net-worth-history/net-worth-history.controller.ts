import { Controller, Get, Post, Delete, Patch, Body, Param, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { NetWorthHistoryService } from './net-worth-history.service';
import { AuthService } from '../../configurations/auth/auth.service';
import { SupabaseAuthGuard } from '../../guards/auth.guard';
import {
    NetWorthHistoryResponse,
    CreateNetWorthSnapshotDto,
    UploadYNABNetWorthDto,
    NetWorthChartResponse,
    UpdateNetWorthNoteDto
} from './dto/net-worth-history.dto';
import { AccountsService } from '../accounts/accounts.service';

@Controller('net-worth-history')
@UseGuards(SupabaseAuthGuard)
export class NetWorthHistoryController {
    constructor(
        private readonly netWorthHistoryService: NetWorthHistoryService,
        private readonly accountsService: AccountsService,
        private readonly authService: AuthService
    ) {}

    @Get('budget/:budgetId')
    async getHistory(
        @Param('budgetId', ParseUUIDPipe) budgetId: string,
        @Req() req: any
    ): Promise<NetWorthChartResponse> {
        const authToken = this.authService.getAuthToken(req);
        return this.netWorthHistoryService.getHistory(budgetId, req.user.id, authToken);
    }

    @Post('snapshot')
    async createSnapshot(
        @Body() dto: CreateNetWorthSnapshotDto,
        @Req() req: any
    ): Promise<NetWorthHistoryResponse> {
        const authToken = this.authService.getAuthToken(req);
        
        // Get current accounts to calculate net worth
        const accounts = await this.accountsService.findAll(req.user.id, authToken, dto.budget_id);
        
        return this.netWorthHistoryService.createSnapshot(dto, req.user.id, authToken, accounts);
    }

    @Post('upload-ynab')
    async uploadYNABCSV(
        @Body() dto: UploadYNABNetWorthDto,
        @Req() req: any
    ): Promise<{ imported_count: number }> {
        const authToken = this.authService.getAuthToken(req);
        return this.netWorthHistoryService.uploadYNABCSV(dto, req.user.id, authToken);
    }

    @Delete('budget/:budgetId')
    async deleteHistory(
        @Param('budgetId', ParseUUIDPipe) budgetId: string,
        @Req() req: any
    ): Promise<{ message: string }> {
        const authToken = this.authService.getAuthToken(req);
        await this.netWorthHistoryService.deleteHistory(budgetId, req.user.id, authToken);
        return { message: 'Net worth history deleted successfully' };
    }

    @Patch('note')
    async updateNote(
        @Body() dto: UpdateNetWorthNoteDto,
        @Req() req: any
    ): Promise<NetWorthHistoryResponse> {
        const authToken = this.authService.getAuthToken(req);
        return this.netWorthHistoryService.updateNote(dto, req.user.id, authToken);
    }
}

