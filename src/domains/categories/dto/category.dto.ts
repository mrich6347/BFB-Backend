import { IsNotEmpty, IsOptional, IsString, IsUUID, IsInt, IsNumber, IsBoolean } from 'class-validator';
import { CategoryBalanceResponse } from '../../category-balances/dto/category-balance.dto';


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

export class UnhideCategoryDto {
  @IsString()
  @IsUUID()
  @IsOptional()
  targetGroupId?: string;
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

export class PullFromReadyToAssignDto {
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


export class CategoryWithReadyToAssignResponse {
  category: CategoryResponse;
  readyToAssign: number;
  categoryBalance?: CategoryBalanceResponse; // Optional for backward compatibility
}

export class CategoryUpdateWithAffectedCategoriesResponse {
  readyToAssign: number;
  category: CategoryResponse; // The updated category data
  categoryBalance: CategoryBalanceResponse; // The updated balance
  affectedCategories?: CategoryResponse[]; // Payment categories that were updated due to debt coverage
}

export class MoveMoneyResponse {
  readyToAssign: number;
  sourceCategoryBalance: CategoryBalanceResponse;
  destinationCategoryBalance: CategoryBalanceResponse;
}
