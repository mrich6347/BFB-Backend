import { IsString, IsNumber, IsBoolean, IsOptional, IsUUID, IsDateString } from 'class-validator';
import { WithUserDateContext } from '../../../common/interfaces/user-date-context.interface';

export class CreateTransactionDto implements WithUserDateContext {
  @IsString()
  @IsUUID()
  account_id: string;

  @IsDateString()
  date: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  memo?: string;

  @IsString()
  @IsOptional()
  payee?: string;

  @IsString()
  @IsOptional()
  category_id?: string;

  @IsBoolean()
  @IsOptional()
  is_cleared?: boolean;

  @IsBoolean()
  @IsOptional()
  is_reconciled?: boolean;

  @IsString()
  @IsUUID()
  @IsOptional()
  transfer_id?: string;

  // User date context for timezone handling
  @IsString()
  @IsOptional()
  userDate?: string;

  @IsNumber()
  @IsOptional()
  userYear?: number;

  @IsNumber()
  @IsOptional()
  userMonth?: number;
}

export class UpdateTransactionDto implements WithUserDateContext {
  @IsDateString()
  @IsOptional()
  date?: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  memo?: string;

  @IsString()
  @IsOptional()
  payee?: string;

  @IsString()
  @IsOptional()
  category_id?: string;

  @IsBoolean()
  @IsOptional()
  is_cleared?: boolean;

  @IsBoolean()
  @IsOptional()
  is_reconciled?: boolean;

  @IsString()
  @IsUUID()
  @IsOptional()
  transfer_id?: string;

  // User date context for timezone handling
  @IsString()
  @IsOptional()
  userDate?: string;

  @IsNumber()
  @IsOptional()
  userYear?: number;

  @IsNumber()
  @IsOptional()
  userMonth?: number;
}

export class TransactionResponse {
  id: string;
  user_id: string;
  account_id: string;
  date: string;
  amount: number;
  memo?: string;
  payee?: string;
  category_id?: string;
  is_cleared: boolean;
  is_reconciled: boolean;
  transfer_id?: string;
  created_at: string;
  updated_at: string;
}

export class TransactionWithAccountsResponse {
  transaction: TransactionResponse;
  sourceAccount?: any; // AccountResponse from accounts module
  targetAccount?: any; // AccountResponse from accounts module
}

export class TransactionDeleteResponse {
  sourceAccount?: any; // AccountResponse from accounts module
  targetAccount?: any; // AccountResponse from accounts module
}

export class TransactionWithReadyToAssignResponse {
  transaction: TransactionResponse;
  readyToAssign: number;
}

export class TransactionWithAccountsAndReadyToAssignResponse {
  transaction: TransactionResponse;
  sourceAccount?: any; // AccountResponse from accounts module
  targetAccount?: any; // AccountResponse from accounts module
  readyToAssign: number;
}
