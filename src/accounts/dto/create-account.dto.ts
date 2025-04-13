import { IsString, IsEnum, IsNumber, IsBoolean, IsOptional } from 'class-validator';
import { AccountType } from '../entities/account.entity';

export class CreateAccountDto {
    @IsString()
    name: string;

    @IsEnum(AccountType)
    account_type: AccountType;

    @IsNumber()
    current_balance: number;

    @IsNumber()
    @IsOptional()
    interest_rate?: number;

    @IsNumber()
    @IsOptional()
    minimum_monthly_payment?: number;

    @IsString()
    budget_id: string;
}
