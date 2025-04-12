import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { CurrencyPlacement } from '../enums/currency-placement.enum';

export class CreateBudgetDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(CurrencyPlacement)
  @IsNotEmpty()
  currency_placement: CurrencyPlacement;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsNotEmpty()
  number_format: string;
}
