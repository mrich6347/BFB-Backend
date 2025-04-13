import { CurrencyPlacement } from '../enums/currency-placement.enum';
import { NumberFormat } from '../enums/number-format.enum';
export class Budget {
  id: number;
  
  user_id: string;
  
  name: string;
  
  currency_placement: CurrencyPlacement;
  
  currency: string;
  
  number_format: NumberFormat;
  
  created_at: Date;
  
  updated_at: Date;
}
