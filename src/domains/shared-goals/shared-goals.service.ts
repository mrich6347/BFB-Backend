import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  CreateSharedGoalDto,
  UpdateSharedGoalDto,
  SharedGoalResponse,
  GoalParticipantResponse,
  GoalProgressResponse,
  GoalStatus
} from './dto/shared-goal.dto';
import { SupabaseService } from '../../supabase/supabase.service';
import { ProgressCalculationService } from './progress-calculation.service';

@Injectable()
export class SharedGoalsService {
  private supabase: SupabaseClient;

  constructor(
    private supabaseService: SupabaseService,
    private progressCalculationService: ProgressCalculationService
  ) {
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

    // Fetch the complete goal data with participants to return
    const completeGoal = await this.findById(data.id, userId, authToken);

    return completeGoal;
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
          id, goal_id, user_profile_id, monthly_contribution, category_id, budget_id, joined_at,
          user_profile:user_profiles(username, display_name)
        )
      `)
      .eq('created_by', userProfile.id);

    if (createdError) {
      console.log("ERROR finding user's created goals:", createdError);
      throw new Error(createdError.message);
    }

    // Query 2: Goals where user is a participant
    // First, find goal IDs where user is a participant
    const { data: userParticipations, error: participationError } = await supabase
      .from('goal_participants')
      .select('goal_id')
      .eq('user_profile_id', userProfile.id)
      .eq('budget_id', budgetId);

    if (participationError) {
      console.log("ERROR finding user participations:", participationError);
      throw new Error(participationError.message);
    }

    const participantGoalIds = userParticipations?.map(p => p.goal_id) || [];

    // Now get the full goal data with all participants for those goals
    const { data: participantGoals, error: participantError } = participantGoalIds.length > 0
      ? await supabase
          .from('shared_goals')
          .select(`
            id, name, description, target_amount, target_date, created_by, status, created_at, updated_at,
            creator_profile:user_profiles!shared_goals_created_by_fkey(username, display_name),
            participants:goal_participants(
              id, goal_id, user_profile_id, monthly_contribution, category_id, budget_id, joined_at,
              user_profile:user_profiles(username, display_name)
            )
          `)
          .in('id', participantGoalIds)
      : { data: [], error: null };

    if (participantError) {
      console.log("ERROR finding user's participant goals:", participantError);
      throw new Error(participantError.message);
    }

    // Merge and deduplicate results
    const allGoals = [...(createdGoals || []), ...(participantGoals || [])];
    const uniqueGoals = allGoals.filter((goal, index, self) =>
      index === self.findIndex(g => g.id === goal.id)
    );

    console.log(`[SharedGoalsService] Found ${allGoals.length} total goals, ${uniqueGoals.length} unique goals`);

    // Filter goals where user is either creator or participant
    const validGoals = uniqueGoals.filter(goal => {
      // Check if user is creator - creators should see their goals regardless of budget
      if (goal.created_by === userProfile.id) {
        // But only if they have at least one participant record (meaning they joined their own goal)
        const creatorParticipant = goal.participants?.find(p => p.user_profile_id === userProfile.id);
        return !!creatorParticipant;
      }

      // Check if user is a participant for the specific budget
      const userParticipant = goal.participants?.find(p =>
        p.user_profile_id === userProfile.id &&
        p.budget_id === budgetId
      );
      return !!userParticipant;
    });

    const goalsWithProgress = await Promise.all(
      validGoals.map(async goal => {
        // Use progress calculation service to get full progress data with contribution percentages
        let progressData: any;
        try {
          progressData = await this.progressCalculationService.calculateGoalProgress(goal.id, userId, authToken);
        } catch (error) {
          console.log(`Error calculating progress for goal ${goal.id}:`, error);
          // Skip this goal if progress calculation fails
          return null;
        }

        if (!progressData) {
          return null;
        }

        const transformedGoal: SharedGoalResponse = {
          ...progressData.goal,
          budget_id: budgetId, // Set the budget_id from the parameter
        };

        return transformedGoal;
      })
    );

    // Filter out null results and sort by created_at desc
    const validGoalsWithProgress = goalsWithProgress.filter(goal => goal !== null);
    return validGoalsWithProgress.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
          id, goal_id, user_profile_id, monthly_contribution, category_id, budget_id, joined_at,
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
      data.participants?.some(p => p.user_profile_id === userProfile.id);

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



  // ===== PROGRESS CALCULATION METHODS =====

  async getGoalProgress(goalId: string, userId: string, authToken: string): Promise<GoalProgressResponse> {
    return this.progressCalculationService.calculateGoalProgress(goalId, userId, authToken);
  }

  async getGoalWithProgress(goalId: string, userId: string, authToken: string): Promise<SharedGoalResponse> {
    return this.progressCalculationService.getGoalWithProgress(goalId, userId, authToken);
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
