import { IsString, IsNumber, IsBoolean, IsOptional, IsUUID, IsEnum, Min, Max, IsDateString } from 'class-validator';

export enum ScheduledFrequency {
  ONCE = 'ONCE',
  MONTHLY = 'MONTHLY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  YEARLY = 'YEARLY'
}

export class CreateScheduledTransactionDto {
  @IsString()
  @IsUUID()
  budget_id: string;

  @IsString()
  @IsUUID()
  account_id: string;

  @IsString()
  @IsUUID()
  @IsOptional()
  category_id?: string;

  @IsString()
  payee: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  memo?: string;

  @IsEnum(ScheduledFrequency)
  frequency: ScheduledFrequency;

  @IsDateString()
  @IsOptional()
  specific_date?: string; // For ONCE frequency (YYYY-MM-DD format)

  @IsNumber()
  @Min(1)
  @Max(31)
  @IsOptional()
  day_of_month?: number; // For MONTHLY and YEARLY

  @IsNumber()
  @Min(0)
  @Max(6)
  @IsOptional()
  day_of_week?: number; // For WEEKLY and BIWEEKLY (0=Sunday, 6=Saturday)

  @IsNumber()
  @Min(1)
  @Max(12)
  @IsOptional()
  month_of_year?: number; // For YEARLY only

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateScheduledTransactionDto {
  @IsString()
  @IsUUID()
  @IsOptional()
  account_id?: string;

  @IsString()
  @IsUUID()
  @IsOptional()
  category_id?: string;

  @IsString()
  @IsOptional()
  payee?: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  memo?: string;

  @IsEnum(ScheduledFrequency)
  @IsOptional()
  frequency?: ScheduledFrequency;

  @IsDateString()
  @IsOptional()
  specific_date?: string;

  @IsNumber()
  @Min(1)
  @Max(31)
  @IsOptional()
  day_of_month?: number;

  @IsNumber()
  @Min(0)
  @Max(6)
  @IsOptional()
  day_of_week?: number;

  @IsNumber()
  @Min(1)
  @Max(12)
  @IsOptional()
  month_of_year?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class ScheduledTransactionResponse {
  id: string;
  user_id: string;
  budget_id: string;
  account_id: string;
  category_id?: string;
  payee: string;
  amount: number;
  memo?: string;
  frequency: ScheduledFrequency;
  specific_date?: string;
  day_of_month?: number;
  day_of_week?: number;
  month_of_year?: number;
  is_active: boolean;
  last_created_date?: string;
  created_at: string;
  updated_at: string;
}

