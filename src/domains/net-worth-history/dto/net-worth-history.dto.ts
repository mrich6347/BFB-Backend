import { IsNotEmpty, IsUUID, IsDateString, IsNumber, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class NetWorthHistoryResponse {
    id: string;
    user_id: string;
    budget_id: string;
    month_date: string;
    total_assets: number;
    total_liabilities: number;
    net_worth: number;
    note?: string;
    created_at: string;
    updated_at: string;
}

export class CreateNetWorthSnapshotDto {
    @IsUUID()
    @IsNotEmpty()
    budget_id: string;

    @IsDateString()
    @IsOptional()
    month_date?: string; // Optional, defaults to current month
}

export class UploadYNABNetWorthDto {
    @IsUUID()
    @IsNotEmpty()
    budget_id: string;

    @IsNotEmpty()
    csv_data: string; // The CSV file content as a string
}

export class NetWorthChartDataPoint {
    month_date: string;
    total_assets: number;
    total_liabilities: number;
    net_worth: number;
    note?: string;
}

export class UpdateNetWorthNoteDto {
    @IsUUID()
    @IsNotEmpty()
    budget_id: string;

    @IsDateString()
    @IsNotEmpty()
    month_date: string;

    @IsOptional()
    note?: string;
}

export class NetWorthChartResponse {
    has_data: boolean;
    data_points: NetWorthChartDataPoint[];
}

