import { CurrencyPlacement } from '../enums/currency-placement.enum';

export class Budget {
  id: number;
  
  user_id: string;
  
  name: string;
  
  currency_placement: CurrencyPlacement;
  
  currency: string;
  
  number_format: string;
  
  created_at: Date;
  
  updated_at: Date;
}
