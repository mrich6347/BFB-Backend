import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import {
    NetWorthHistoryResponse,
    CreateNetWorthSnapshotDto,
    UploadYNABNetWorthDto,
    NetWorthChartResponse,
    NetWorthChartDataPoint,
    UpdateNetWorthNoteDto
} from './dto/net-worth-history.dto';
import { AccountResponse } from '../accounts/DTO/account.dto';

@Injectable()
export class NetWorthHistoryService {
    constructor(private readonly supabaseService: SupabaseService) {}

    /**
     * Get all net worth history for a budget
     */
    async getHistory(budgetId: string, userId: string, authToken: string): Promise<NetWorthChartResponse> {
        const supabase = this.supabaseService.getAuthenticatedClient(authToken);

        const { data, error } = await supabase
            .from('net_worth_history')
            .select('*')
            .eq('user_id', userId)
            .eq('budget_id', budgetId)
            .order('month_date', { ascending: true });

        if (error) {
            throw new Error(error.message);
        }

        const dataPoints: NetWorthChartDataPoint[] = data.map(record => ({
            month_date: record.month_date,
            total_assets: parseFloat(record.total_assets),
            total_liabilities: parseFloat(record.total_liabilities),
            net_worth: parseFloat(record.net_worth),
            note: record.note
        }));

        return {
            has_data: dataPoints.length > 0,
            data_points: dataPoints
        };
    }

    /**
     * Create a snapshot of current net worth
     */
    async createSnapshot(
        dto: CreateNetWorthSnapshotDto, 
        userId: string, 
        authToken: string,
        accounts: AccountResponse[]
    ): Promise<NetWorthHistoryResponse> {
        const supabase = this.supabaseService.getAuthenticatedClient(authToken);

        // Calculate current net worth from accounts
        const { totalAssets, totalLiabilities, netWorth } = this.calculateNetWorth(accounts);

        // Use provided month_date or default to first day of current month
        const monthDate = dto.month_date || this.getFirstDayOfMonth(new Date());

        const insertData = {
            user_id: userId,
            budget_id: dto.budget_id,
            month_date: monthDate,
            total_assets: totalAssets,
            total_liabilities: totalLiabilities,
            net_worth: netWorth
        };

        // Upsert to handle duplicate months
        const { data, error } = await supabase
            .from('net_worth_history')
            .upsert(insertData, {
                onConflict: 'user_id,budget_id,month_date'
            })
            .select()
            .single();

        if (error) {
            throw new Error(error.message);
        }

        return data;
    }

    /**
     * Upload and parse YNAB net worth CSV
     */
    async uploadYNABCSV(
        dto: UploadYNABNetWorthDto, 
        userId: string, 
        authToken: string
    ): Promise<{ imported_count: number }> {
        const supabase = this.supabaseService.getAuthenticatedClient(authToken);

        // Parse CSV
        const records = this.parseYNABNetWorthCSV(dto.csv_data);

        // Prepare data for insertion
        const insertData = records.map(record => ({
            user_id: userId,
            budget_id: dto.budget_id,
            month_date: record.month_date,
            total_assets: record.total_assets,
            total_liabilities: record.total_liabilities,
            net_worth: record.net_worth
        }));

        // Batch upsert all records
        const { data, error } = await supabase
            .from('net_worth_history')
            .upsert(insertData, {
                onConflict: 'user_id,budget_id,month_date'
            })
            .select();

        if (error) {
            throw new Error(error.message);
        }

        return { imported_count: data.length };
    }

    /**
     * Delete all net worth history for a budget
     */
    async deleteHistory(budgetId: string, userId: string, authToken: string): Promise<void> {
        const supabase = this.supabaseService.getAuthenticatedClient(authToken);

        const { error } = await supabase
            .from('net_worth_history')
            .delete()
            .eq('user_id', userId)
            .eq('budget_id', budgetId);

        if (error) {
            throw new Error(error.message);
        }
    }

    /**
     * Update note for a specific net worth history record
     */
    async updateNote(
        dto: UpdateNetWorthNoteDto,
        userId: string,
        authToken: string
    ): Promise<NetWorthHistoryResponse> {
        const supabase = this.supabaseService.getAuthenticatedClient(authToken);

        const { data, error } = await supabase
            .from('net_worth_history')
            .update({ note: dto.note })
            .eq('user_id', userId)
            .eq('budget_id', dto.budget_id)
            .eq('month_date', dto.month_date)
            .select()
            .single();

        if (error) {
            throw new Error(error.message);
        }

        return data;
    }

    /**
     * Parse YNAB net worth CSV format
     */
    private parseYNABNetWorthCSV(csvData: string): NetWorthChartDataPoint[] {
        const lines = csvData.trim().split('\n');

        if (lines.length < 2) {
            throw new BadRequestException('CSV file is empty or invalid');
        }

        // First line contains headers with month/year columns
        const headers = this.parseCSVLine(lines[0]);

        // Parse all account rows
        const accountRows: string[][] = [];
        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCSVLine(lines[i]);
            accountRows.push(row);
        }

        const records: NetWorthChartDataPoint[] = [];

        // Process each month column (skip first column which is "Account")
        for (let colIndex = 1; colIndex < headers.length; colIndex++) {
            const monthHeader = headers[colIndex];

            let totalAssets = 0;
            let totalLiabilities = 0;
            let netWorth = 0;

            // Sum up all accounts for this month
            for (const row of accountRows) {
                const accountName = row[0];
                const value = parseFloat(row[colIndex] || '0');

                // Skip the "Net Worth" summary row if it exists
                if (accountName === 'Net Worth') {
                    netWorth = value;
                    continue;
                }

                // Positive values are assets, negative values are liabilities
                if (value > 0) {
                    totalAssets += value;
                } else if (value < 0) {
                    totalLiabilities += value;
                }
            }

            // If we found a Net Worth row, use it; otherwise calculate
            if (netWorth === 0) {
                netWorth = totalAssets + totalLiabilities;
            }

            // Skip months with no data
            if (netWorth === 0 && totalAssets === 0 && totalLiabilities === 0) {
                continue;
            }

            // Parse month header (e.g., "Oct 2020" -> "2020-10-01")
            const monthDate = this.parseMonthHeader(monthHeader);

            records.push({
                month_date: monthDate,
                total_assets: totalAssets,
                total_liabilities: totalLiabilities,
                net_worth: netWorth
            });
        }

        return records;
    }

    /**
     * Parse a CSV line handling quoted values
     */
    private parseCSVLine(line: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    /**
     * Parse month header like "Oct 2020" to "2020-11-01" (November 1st)
     * YNAB's "Oct 2020" column represents the balance at the END of October,
     * which is effectively the beginning of November, so we store it as Nov 1st
     */
    private parseMonthHeader(header: string): string {
        const months: { [key: string]: number } = {
            'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3,
            'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7,
            'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
        };

        const parts = header.trim().split(' ');
        if (parts.length !== 2) {
            throw new BadRequestException(`Invalid month header: ${header}`);
        }

        const monthIndex = months[parts[0]];
        const year = parseInt(parts[1]);

        if (monthIndex === undefined) {
            throw new BadRequestException(`Invalid month: ${parts[0]}`);
        }

        // Create date for the given month, then add 1 month to get the first day of next month
        const date = new Date(year, monthIndex, 1);
        date.setMonth(date.getMonth() + 1);

        const resultYear = date.getFullYear();
        const resultMonth = String(date.getMonth() + 1).padStart(2, '0');

        return `${resultYear}-${resultMonth}-01`;
    }

    /**
     * Calculate net worth from accounts
     */
    private calculateNetWorth(accounts: AccountResponse[]): {
        totalAssets: number;
        totalLiabilities: number;
        netWorth: number;
    } {
        let totalAssets = 0;
        let totalLiabilities = 0;

        accounts.forEach(account => {
            if (!account.is_active) {
                return;
            }

            const balance = account.working_balance ?? account.account_balance ?? 0;

            if (account.account_type === 'CASH' || account.account_type === 'TRACKING') {
                totalAssets += balance;
            } else if (account.account_type === 'CREDIT') {
                totalLiabilities += balance;
            }
        });

        return {
            totalAssets,
            totalLiabilities,
            netWorth: totalAssets + totalLiabilities
        };
    }

    /**
     * Get first day of month in YYYY-MM-DD format
     */
    private getFirstDayOfMonth(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}-01`;
    }
}

