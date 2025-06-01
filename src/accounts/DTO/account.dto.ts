import { IsString, IsEnum, IsNumber, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { AccountType } from '../entities/account.entity';

export class CreateAccountDto {
    @IsString()
    @IsUUID()
    id: string;

    @IsString()
    name: string;

    @IsEnum(AccountType)
    account_type: AccountType;

    @IsNumber()
    current_balance: number;
                                            
    @IsNumber()
    @IsOptional()
    interest_rate: number;

    @IsNumber()
    @IsOptional()
    minimum_monthly_payment: number;

    @IsString()
    @IsUUID()
    budget_id: string;
}

export class AccountResponse {
    id: string;
    name: string;
    account_type: AccountType;
    budget_id: string;
    interest_rate?: number;
    minimum_monthly_payment?: number;
    cleared_balance: number;
    uncleared_balance: number;
    working_balance: number;
    is_active: boolean;
}

export class AccountWithReadyToAssignResponse {
    account: AccountResponse;
    readyToAssign: number;
}
