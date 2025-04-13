import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { CurrencyPlacement } from '../enums/currency-placement.enum';
import { DateFormat } from '../enums/date-format.enum';
import { NumberFormat } from '../enums/number-format.enum';
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
