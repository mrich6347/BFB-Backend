import { IsNumber, IsOptional, IsUUID, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpsertRetirementSettingsDto {
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  monthly_contribution: number;

  @IsNumber()
  @Min(18)
  @Max(100)
  retirement_age: number;
}

export class RetirementSettingsResponse {
  id: string;
  user_id: string;
  budget_id: string;
  monthly_contribution: number;
  retirement_age: number;
  created_at: string;
  updated_at: string;
}

