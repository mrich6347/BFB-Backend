import { IsString, IsEnum, IsNumber, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export enum AccountType {
    CASH = 'CASH',
    TRACKING = 'TRACKING',
    CREDIT = 'CREDIT'
}

export class CreateAccountDto {
    @IsString()
    @IsUUID()
    id: string;

    @IsString()
    name: string;

    @IsEnum(AccountType)
    account_type: AccountType;

    @IsNumber()
    account_balance: number;

    @IsString()
    @IsUUID()
    budget_id: string;
}

export class AccountResponse {
    id: string;
    name: string;
    account_type: AccountType;
    budget_id: string;
    account_balance: number;
    cleared_balance: number;
    uncleared_balance: number;
    working_balance: number;
    is_active: boolean;
}

export class AccountWithReadyToAssignResponse {
    account: AccountResponse;
    readyToAssign: number;
}

export class ReconcileAccountDto {
    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    actual_balance: number;
}

export class UpdateAccountDto {
    @IsString()
    @IsOptional()
    name?: string;
}

export class CloseAccountResponse {
    account: AccountResponse;
    adjustmentTransaction?: any; // TransactionResponse type from transactions module
    readyToAssign: number;
}

export class ReconcileAccountResponse {
    account: AccountResponse;
    adjustmentTransaction?: any; // TransactionResponse type from transactions module
    readyToAssign: number;
}

export class UpdateTrackingBalanceDto {
    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    new_balance: number;

    @IsString()
    @IsOptional()
    memo?: string;
}

export class BalanceHistoryPoint {
    date: string;
    balance: number;
    memo?: string;
    transaction_id?: string;
}
