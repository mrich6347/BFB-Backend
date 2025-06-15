import { IsString, IsNumber, IsUUID, IsArray, ValidateNested, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { WithUserDateContext } from '../../common/interfaces/user-date-context.interface';

export class CreateAutoAssignConfigurationItemDto {
  @IsString()
  @IsUUID()
  category_id: string;

  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class CreateAutoAssignConfigurationDto {
  @IsString()
  name: string;

  @IsString()
  @IsUUID()
  budget_id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAutoAssignConfigurationItemDto)
  items: CreateAutoAssignConfigurationItemDto[];
}

export class UpdateAutoAssignConfigurationDto {
  @IsString()
  name?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAutoAssignConfigurationItemDto)
  items?: CreateAutoAssignConfigurationItemDto[];
}

export class AutoAssignConfigurationItemResponse {
  id: string;
  category_id: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export class AutoAssignConfigurationResponse {
  name: string;
  budget_id: string;
  user_id: string;
  items: AutoAssignConfigurationItemResponse[];
  created_at: string;
  updated_at: string;
}

export class ApplyAutoAssignConfigurationDto implements WithUserDateContext {
  @IsString()
  name: string;

  @IsString()
  @IsUUID()
  budget_id: string;

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

export class AutoAssignConfigurationSummary {
  name: string;
  budget_id: string;
  user_id: string;
  item_count: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
}
