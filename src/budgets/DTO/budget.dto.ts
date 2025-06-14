import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { DateFormat, NumberFormat, CurrencyPlacement } from '../entities/budget.entity';

export class CreateBudgetDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsEnum(CurrencyPlacement)
  @IsNotEmpty()
  currency_placement: CurrencyPlacement;


  @IsEnum(NumberFormat)
  @IsNotEmpty()
  number_format: NumberFormat;

  @IsEnum(DateFormat)
  @IsNotEmpty()
  date_format: DateFormat;
}

export class UpdateBudgetDto {


  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name: string;

  @IsString()
  @IsOptional()
  currency: string;

  @IsEnum(CurrencyPlacement)
  @IsOptional()
  currency_placement: CurrencyPlacement;

  @IsEnum(DateFormat)
  @IsOptional()
  date_format: DateFormat;

  @IsEnum(NumberFormat)
  @IsOptional()
  number_format: NumberFormat;

}

export class BudgetResponse {
  id: string;
  name: string;
  currency: string;
  currency_placement: CurrencyPlacement;
  date_format: DateFormat;
  number_format: NumberFormat;
  updated_at: Date;
}