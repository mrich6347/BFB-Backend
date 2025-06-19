import { IsNotEmpty, IsOptional, IsString, IsUUID, IsInt, IsNumber } from 'class-validator';

export class CreateCategoryBalanceDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  category_id: string;

  @IsString()
  @IsUUID()
  @IsNotEmpty()
  budget_id: string;

  @IsInt()
  @IsNotEmpty()
  year: number;

  @IsInt()
  @IsNotEmpty()
  month: number;

  @IsNumber()
  @IsOptional()
  assigned?: number;

  @IsNumber()
  @IsOptional()
  activity?: number;

  @IsNumber()
  @IsOptional()
  available?: number;
}

export class UpdateCategoryBalanceDto {
  @IsNumber()
  @IsOptional()
  assigned?: number;

  @IsNumber()
  @IsOptional()
  activity?: number;

  @IsNumber()
  @IsOptional()
  available?: number;
}

export class CategoryBalanceResponse {
  id: string;
  category_id: string;
  budget_id: string;
  user_id: string;
  year: number;
  month: number;
  assigned: number;
  activity: number;
  available: number;
  created_at: Date;
  updated_at: Date;
}
