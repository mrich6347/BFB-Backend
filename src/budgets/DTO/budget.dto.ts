import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DateFormat, NumberFormat, CurrencyPlacement } from '../entities/budget.entity';

export class CreateBudgetDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(CurrencyPlacement)
  @IsNotEmpty()
  currency_placement: CurrencyPlacement;

  @IsEnum(DateFormat)
  @IsNotEmpty()
  date_format: DateFormat;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsEnum(NumberFormat)
  @IsNotEmpty()
  number_format: NumberFormat;
}
