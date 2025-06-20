import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { 
  CreateSharedGoalDto, 
  UpdateSharedGoalDto, 
  SharedGoalResponse,
  GoalParticipantResponse,
  CreateInvitationDto,
  InvitationResponse,
  UpdateParticipantDto,
  GoalStatus,
  ParticipantStatus,
  InvitationStatus
} from './dto/shared-goal.dto';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class SharedGoalsService {
  private supabase: SupabaseClient;

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
  }

  async create(createSharedGoalDto: CreateSharedGoalDto, userId: string, authToken: string): Promise<SharedGoalResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    // Get user's profile to use as created_by
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError || !userProfile) {
      throw new NotFoundException('User profile not found. Please create a profile first.');
    }

    const payload = {
      ...createSharedGoalDto,
      created_by: userProfile.id,
      status: GoalStatus.ACTIVE,
    };

    const { data, error } = await supabase
      .from('shared_goals')
      .insert([payload])
      .select(`
        id, name, description, target_amount, target_date, created_by, status, created_at, updated_at,
        creator_profile:user_profiles!shared_goals_created_by_fkey(username, display_name)
      `)
      .single();

    if (error) {
      console.log("ERROR creating shared goal:", error);
      throw new Error(error.message);
    }

    // Automatically add creator as participant
    await this.addCreatorAsParticipant(data.id, userProfile.id, userId, authToken);

    // Transform the response to match our DTO structure
    const transformedData: SharedGoalResponse = {
      ...data,
      creator_profile: Array.isArray(data.creator_profile) ? data.creator_profile[0] : data.creator_profile
    };

    return transformedData;
  }

  async findByUserId(userId: string, budgetId: string, authToken: string): Promise<SharedGoalResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get user's profile
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError || !userProfile) {
      return [];
    }

    // Get goals where user is creator or participant for the specific budget
    // We need to do this in two separate queries and merge the results

    // Query 1: Goals where user is the creator
    const { data: createdGoals, error: createdError } = await supabase
      .from('shared_goals')
      .select(`
        id, name, description, target_amount, target_date, created_by, status, created_at, updated_at,
        creator_profile:user_profiles!shared_goals_created_by_fkey(username, display_name),
        participants:goal_participants(
          id, goal_id, user_profile_id, monthly_contribution, category_id, budget_id, status, joined_at,
          user_profile:user_profiles(username, display_name)
        )
      `)
      .eq('created_by', userProfile.id);

    if (createdError) {
      console.log("ERROR finding user's created goals:", createdError);
      throw new Error(createdError.message);
    }

    // Query 2: Goals where user is a participant
    const { data: participantGoals, error: participantError } = await supabase
      .from('shared_goals')
      .select(`
        id, name, description, target_amount, target_date, created_by, status, created_at, updated_at,
        creator_profile:user_profiles!shared_goals_created_by_fkey(username, display_name),
        participants:goal_participants!inner(
          id, goal_id, user_profile_id, monthly_contribution, category_id, budget_id, status, joined_at,
          user_profile:user_profiles(username, display_name)
        )
      `)
      .eq('participants.user_profile_id', userProfile.id)
      .eq('participants.status', ParticipantStatus.ACTIVE)
      .eq('participants.budget_id', budgetId);

    if (participantError) {
      console.log("ERROR finding user's participant goals:", participantError);
      throw new Error(participantError.message);
    }

    // Merge and deduplicate results
    const allGoals = [...(createdGoals || []), ...(participantGoals || [])];
    const uniqueGoals = allGoals.filter((goal, index, self) =>
      index === self.findIndex(g => g.id === goal.id)
    );

    // Filter participants for the specific budget and transform the response
    const transformedData: SharedGoalResponse[] = uniqueGoals
      .map(goal => {
        // Filter participants to only include those for the specific budget
        const filteredParticipants = goal.participants?.filter(p =>
          p.budget_id === budgetId && p.status === ParticipantStatus.ACTIVE
        );

        // Only include goals that have participants for this budget
        if (!filteredParticipants || filteredParticipants.length === 0) {
          return null;
        }

        const transformedParticipants = filteredParticipants.map(participant => ({
          ...participant,
          user_profile: Array.isArray(participant.user_profile) ? participant.user_profile[0] : participant.user_profile
        }));

        return {
          ...goal,
          creator_profile: Array.isArray(goal.creator_profile) ? goal.creator_profile[0] : goal.creator_profile,
          participants: transformedParticipants,
          budget_id: budgetId // Set the budget_id from the parameter
        };
      })
      .filter(goal => goal !== null) // Remove null entries
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // Sort by created_at desc

    return transformedData;
  }

  async findById(goalId: string, userId: string, authToken: string): Promise<SharedGoalResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    // Get user's profile
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError || !userProfile) {
      throw new NotFoundException('User profile not found');
    }

    const { data, error } = await supabase
      .from('shared_goals')
      .select(`
        id, name, description, target_amount, target_date, created_by, status, created_at, updated_at,
        creator_profile:user_profiles!shared_goals_created_by_fkey(username, display_name),
        participants:goal_participants(
          id, goal_id, user_profile_id, monthly_contribution, category_id, budget_id, status, joined_at,
          user_profile:user_profiles(username, display_name)
        )
      `)
      .eq('id', goalId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException('Goal not found');
      }
      console.log("ERROR finding shared goal:", error);
      throw new Error(error.message);
    }

    // Check if user has access to this goal
    const hasAccess = data.created_by === userProfile.id ||
      data.participants?.some(p => p.user_profile_id === userProfile.id && p.status === ParticipantStatus.ACTIVE);

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this goal');
    }

    // Transform the response to match our DTO structure
    const transformedData: SharedGoalResponse = {
      ...data,
      creator_profile: Array.isArray(data.creator_profile) ? data.creator_profile[0] : data.creator_profile,
      participants: data.participants?.map(participant => ({
        ...participant,
        user_profile: Array.isArray(participant.user_profile) ? participant.user_profile[0] : participant.user_profile
      })) as GoalParticipantResponse[]
    };

    return transformedData;
  }

  async update(goalId: string, updateSharedGoalDto: UpdateSharedGoalDto, userId: string, authToken: string): Promise<SharedGoalResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    // Get user's profile and check if they're the creator
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError || !userProfile) {
      throw new NotFoundException('User profile not found');
    }

    // Check if user is the creator
    const { data: goal, error: goalError } = await supabase
      .from('shared_goals')
      .select('created_by')
      .eq('id', goalId)
      .single();

    if (goalError) {
      throw new NotFoundException('Goal not found');
    }

    if (goal.created_by !== userProfile.id) {
      throw new ForbiddenException('Only the goal creator can update the goal');
    }

    const { data, error } = await supabase
      .from('shared_goals')
      .update(updateSharedGoalDto)
      .eq('id', goalId)
      .select(`
        id, name, description, target_amount, target_date, created_by, status, created_at, updated_at,
        creator_profile:user_profiles!shared_goals_created_by_fkey(username, display_name)
      `)
      .single();

    if (error) {
      console.log("ERROR updating shared goal:", error);
      throw new Error(error.message);
    }

    // Transform the response to match our DTO structure
    const transformedData: SharedGoalResponse = {
      ...data,
      creator_profile: Array.isArray(data.creator_profile) ? data.creator_profile[0] : data.creator_profile
    };

    return transformedData;
  }

  async delete(goalId: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    // Get user's profile and check if they're the creator
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError || !userProfile) {
      throw new NotFoundException('User profile not found');
    }

    // Check if user is the creator
    const { data: goal, error: goalError } = await supabase
      .from('shared_goals')
      .select('created_by')
      .eq('id', goalId)
      .single();

    if (goalError) {
      throw new NotFoundException('Goal not found');
    }

    if (goal.created_by !== userProfile.id) {
      throw new ForbiddenException('Only the goal creator can delete the goal');
    }

    const { error } = await supabase
      .from('shared_goals')
      .delete()
      .eq('id', goalId);

    if (error) {
      console.log("ERROR deleting shared goal:", error);
      throw new Error(error.message);
    }
  }

  private async addCreatorAsParticipant(goalId: string, userProfileId: string, userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    
    // Get user's first budget to use as default
    const { data: budget, error: budgetError } = await supabase
      .from('budgets')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (budgetError || !budget) {
      throw new NotFoundException('User must have at least one budget to create a goal');
    }

    const participantData = {
      goal_id: goalId,
      user_profile_id: userProfileId,
      budget_id: budget.id,
      status: ParticipantStatus.ACTIVE,
      joined_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('goal_participants')
      .insert([participantData]);

    if (error) {
      console.log("ERROR adding creator as participant:", error);
      throw new Error(error.message);
    }
  }
}
