import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MinLength, MaxLength, IsDateString } from 'class-validator';

export class CreateUserProfileDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30, { message: 'Username must be at most 30 characters long' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens'
  })
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Display name must be at most 100 characters long' })
  display_name: string;

  @IsDateString()
  @IsOptional()
  birthdate?: string;
}

export class UpdateUserProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30, { message: 'Username must be at most 30 characters long' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens'
  })
  username?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Display name must be at most 100 characters long' })
  display_name?: string;

  @IsDateString()
  @IsOptional()
  birthdate?: string;
}

export class SearchUserProfileDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: 'Search query must be at least 1 character long' })
  @MaxLength(30, { message: 'Search query must be at most 30 characters long' })
  username: string;
}

export class UserProfileResponse {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  birthdate?: string;
  created_at: Date;
  updated_at: Date;
}

export class PublicUserProfileResponse {
  username: string;
  display_name: string;
}
