import { 
  IsNotEmpty, 
  IsOptional, 
  IsString, 
  IsUUID, 
  IsNumber, 
  IsDateString, 
  IsEnum, 
  Min,
  Max,
  MaxLength 
} from 'class-validator';

export enum GoalStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED'
}



export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED'
}



export class CreateSharedGoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Goal name must be at most 100 characters long' })
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Description must be at most 500 characters long' })
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Target amount must be greater than 0' })
  @Max(999999999.99, { message: 'Target amount is too large' })
  target_amount: number;

  @IsDateString()
  @IsOptional()
  target_date?: string;
}

export class UpdateSharedGoalDto {
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Goal name must be at most 100 characters long' })
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Description must be at most 500 characters long' })
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0.01, { message: 'Target amount must be greater than 0' })
  @Max(999999999.99, { message: 'Target amount is too large' })
  target_amount?: number;

  @IsDateString()
  @IsOptional()
  target_date?: string;

  @IsEnum(GoalStatus)
  @IsOptional()
  status?: GoalStatus;
}

export class SharedGoalResponse {
  id: string;
  name: string;
  description?: string;
  target_amount: number;
  target_date?: Date;
  created_by: string;
  budget_id?: string; // Optional since it's derived from participants
  status: GoalStatus;
  created_at: Date;
  updated_at: Date;
  creator_profile?: {
    username: string;
    display_name: string;
  };
  participants?: GoalParticipantResponse[];
  current_amount?: number;
  progress_percentage?: number;
}

export class GoalParticipantResponse {
  id: string;
  goal_id: string;
  user_profile_id: string;
  monthly_contribution?: number;
  category_id?: string;
  budget_id: string;
  joined_at: Date;
  user_profile: {
    username: string;
    display_name: string;
  };
  category?: {
    id: string;
    name: string;
    available_balance?: number;
  };
  current_contribution?: number;
  contribution_percentage?: number;
}

export class CreateInvitationDto {
  @IsString()
  @IsNotEmpty()
  invitee_username: string;
}

export class InvitationResponse {
  id: string;
  goal_id: string;
  inviter_id: string;
  invitee_username: string;
  invitee_id?: string;
  status: InvitationStatus;
  expires_at: Date;
  created_at: Date;
  goal: {
    id: string;
    name: string;
    target_amount: number;
  };
  inviter_profile: {
    username: string;
    display_name: string;
  };
}

export class UpdateParticipantDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0, { message: 'Monthly contribution must be 0 or greater' })
  @Max(999999.99, { message: 'Monthly contribution is too large' })
  monthly_contribution?: number;

  @IsUUID()
  @IsOptional()
  category_id?: string;
}



export class ParticipantWithProgressResponse extends GoalParticipantResponse {
  // Inherits current_contribution and contribution_percentage from base class
}

export class GoalProgressResponse {
  goal: SharedGoalResponse;
  current_amount: number;
  progress_percentage: number;
  projected_completion_date?: Date;
  participants_with_progress: ParticipantWithProgressResponse[];
}
