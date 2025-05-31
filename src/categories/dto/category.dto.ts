import { IsNotEmpty, IsOptional, IsString, IsUUID, IsInt, IsNumber } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsUUID()
  @IsNotEmpty()
  category_group_id: string;

  @IsString()
  @IsUUID()
  @IsNotEmpty()
  budget_id: string;

  @IsInt()
  @IsOptional()
  display_order?: number;
}

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  assigned?: number;

  @IsNumber()
  @IsOptional()
  activity?: number;

  @IsNumber()
  @IsOptional()
  available?: number;

  @IsInt()
  @IsOptional()
  display_order?: number;
}

export class ReorderCategoriesDto {
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  category_ids: string[];
}

export class MoveMoneyDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  sourceCategoryId: string;

  @IsString()
  @IsUUID()
  @IsNotEmpty()
  destinationCategoryId: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsInt()
  @IsNotEmpty()
  year: number;

  @IsInt()
  @IsNotEmpty()
  month: number;
}

export class CategoryResponse {
  id: string;
  name: string;
  category_group_id: string;
  budget_id: string;
  assigned: number;
  activity: number;
  available: number;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}
