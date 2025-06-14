import { IsNotEmpty, IsOptional, IsString, IsUUID, IsInt } from 'class-validator';

export class CreateCategoryGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsUUID()
  @IsNotEmpty()
  budget_id: string;

  @IsInt()
  @IsOptional()
  display_order?: number;
}

export class UpdateCategoryGroupDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @IsOptional()
  display_order?: number;
}

export class ReorderCategoryGroupsDto {
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  group_ids: string[];
}

export class CategoryGroupResponse {
  id: string;
  name: string;
  budget_id: string;
  display_order: number;
  is_system_group: boolean;
  created_at: Date;
  updated_at: Date;
}
