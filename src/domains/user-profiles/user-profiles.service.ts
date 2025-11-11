import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { 
  CreateUserProfileDto, 
  UpdateUserProfileDto, 
  UserProfileResponse, 
  PublicUserProfileResponse 
} from './dto/user-profile.dto';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class UserProfilesService {
  private supabase: SupabaseClient;

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
  }

  async create(createUserProfileDto: CreateUserProfileDto, userId: string, authToken: string): Promise<UserProfileResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    // Check if user already has a profile
    const existingProfile = await this.findByUserId(userId, authToken);
    if (existingProfile) {
      throw new ConflictException('User profile already exists');
    }

    // Check username uniqueness
    await this.checkUsernameAvailability(createUserProfileDto.username, authToken);

    const payload = {
      ...createUserProfileDto,
      user_id: userId,
    };

    const { data, error } = await supabase
      .from('user_profiles')
      .insert([payload])
      .select('id, user_id, username, display_name, birthdate, created_at, updated_at')
      .single();

    if (error) {
      console.log("ERROR creating user profile:", error);
      throw new Error(error.message);
    }

    return data;
  }

  async findByUserId(userId: string, authToken: string): Promise<UserProfileResponse | null> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, user_id, username, display_name, birthdate, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.log("ERROR finding user profile by user_id:", error);
      throw new Error(error.message);
    }

    return data;
  }

  async findByUsername(username: string, authToken: string): Promise<PublicUserProfileResponse | null> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('user_profiles')
      .select('username, display_name')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      console.log("ERROR finding user profile by username:", error);
      throw new Error(error.message);
    }

    return data;
  }

  async update(updateUserProfileDto: UpdateUserProfileDto, userId: string, authToken: string): Promise<UserProfileResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Check if username is being updated and if it's available
    if (updateUserProfileDto.username) {
      await this.checkUsernameAvailability(updateUserProfileDto.username, authToken, userId);
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updateUserProfileDto)
      .eq('user_id', userId)
      .select('id, user_id, username, display_name, birthdate, created_at, updated_at')
      .single();

    if (error) {
      console.log("ERROR updating user profile:", error);
      throw new Error(error.message);
    }

    return data;
  }

  async searchByUsername(searchQuery: string, authToken: string): Promise<PublicUserProfileResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    const { data, error } = await supabase
      .from('user_profiles')
      .select('username, display_name')
      .ilike('username', `%${searchQuery}%`)
      .limit(10)
      .order('username');

    if (error) {
      console.log("ERROR searching user profiles:", error);
      throw new Error(error.message);
    }

    return data || [];
  }

  private async checkUsernameAvailability(username: string, authToken: string, excludeUserId?: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    let query = supabase
      .from('user_profiles')
      .select('id, username, user_id')
      .eq('username', username);

    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      throw new ConflictException(`Username '${username}' is already taken`);
    }
  }
}
