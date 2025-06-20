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
  GoalProgressResponse,
  GoalStatus,
  ParticipantStatus,
  InvitationStatus
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
    const validGoals = uniqueGoals.filter(goal => {
      const filteredParticipants = goal.participants?.filter(p =>
        p.budget_id === budgetId && p.status === ParticipantStatus.ACTIVE
      );
      return filteredParticipants && filteredParticipants.length > 0;
    });

    const goalsWithProgress = await Promise.all(
      validGoals.map(async goal => {
        // Filter participants to only include those for the specific budget
        const filteredParticipants = goal.participants?.filter(p =>
          p.budget_id === budgetId && p.status === ParticipantStatus.ACTIVE
        ) || [];

        const transformedParticipants = filteredParticipants.map(participant => ({
          ...participant,
          user_profile: Array.isArray(participant.user_profile) ? participant.user_profile[0] : participant.user_profile
        }));

        // Calculate progress for this goal
        let currentAmount = 0;
        for (const participant of transformedParticipants) {
          if (participant.category_id) {
            const contribution = await this.progressCalculationService.getParticipantContribution(
              participant.category_id,
              participant.budget_id,
              authToken
            );
            currentAmount += contribution;
          }
        }

        const progressPercentage = goal.target_amount > 0
          ? Math.min((currentAmount / goal.target_amount) * 100, 100)
          : 0;

        const transformedGoal: SharedGoalResponse = {
          ...goal,
          creator_profile: Array.isArray(goal.creator_profile) ? goal.creator_profile[0] : goal.creator_profile,
          participants: transformedParticipants,
          budget_id: budgetId, // Set the budget_id from the parameter
          current_amount: currentAmount,
          progress_percentage: progressPercentage
        };

        return transformedGoal;
      })
    );

    // Sort by created_at desc
    return goalsWithProgress.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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

  // ===== INVITATION METHODS =====

  async inviteUser(goalId: string, createInvitationDto: CreateInvitationDto, userId: string, authToken: string): Promise<InvitationResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get inviter's profile
    const { data: inviterProfile, error: inviterError } = await supabase
      .from('user_profiles')
      .select('id, username, display_name')
      .eq('user_id', userId)
      .single();

    if (inviterError || !inviterProfile) {
      throw new NotFoundException('Inviter profile not found');
    }

    // Verify goal exists and user has permission to invite
    const goal = await this.findById(goalId, userId, authToken);
    if (goal.created_by !== inviterProfile.id) {
      throw new ForbiddenException('Only the goal creator can send invitations');
    }

    // Find invitee by username
    const { data: inviteeProfile, error: inviteeError } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, user_id')
      .eq('username', createInvitationDto.invitee_username)
      .single();

    if (inviteeError || !inviteeProfile) {
      throw new NotFoundException(`User with username '${createInvitationDto.invitee_username}' not found`);
    }

    // Check if user is already a participant
    const { data: existingParticipant } = await supabase
      .from('goal_participants')
      .select('id')
      .eq('goal_id', goalId)
      .eq('user_profile_id', inviteeProfile.id)
      .single();

    if (existingParticipant) {
      throw new ConflictException('User is already a participant in this goal');
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await supabase
      .from('goal_invitations')
      .select('id')
      .eq('goal_id', goalId)
      .eq('invitee_id', inviteeProfile.id)
      .eq('status', InvitationStatus.PENDING)
      .single();

    if (existingInvitation) {
      throw new ConflictException('User already has a pending invitation for this goal');
    }

    // Create invitation with 7-day expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitationData = {
      goal_id: goalId,
      inviter_id: inviterProfile.id,
      invitee_username: createInvitationDto.invitee_username,
      invitee_id: inviteeProfile.id,
      status: InvitationStatus.PENDING,
      expires_at: expiresAt.toISOString(),
    };

    const { data: invitation, error: invitationError } = await supabase
      .from('goal_invitations')
      .insert([invitationData])
      .select(`
        id, goal_id, inviter_id, invitee_username, invitee_id, status, expires_at, created_at,
        goal:shared_goals(id, name, target_amount),
        inviter_profile:user_profiles!goal_invitations_inviter_id_fkey(username, display_name)
      `)
      .single();

    if (invitationError) {
      console.log("ERROR creating invitation:", invitationError);
      throw new Error(invitationError.message);
    }

    // Transform the response
    const transformedData: InvitationResponse = {
      ...invitation,
      goal: Array.isArray(invitation.goal) ? invitation.goal[0] : invitation.goal,
      inviter_profile: Array.isArray(invitation.inviter_profile) ? invitation.inviter_profile[0] : invitation.inviter_profile
    };

    return transformedData;
  }

  async getInvitations(userId: string, authToken: string): Promise<InvitationResponse[]> {
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

    // Get all pending invitations for the user
    const { data: invitations, error } = await supabase
      .from('goal_invitations')
      .select(`
        id, goal_id, inviter_id, invitee_username, invitee_id, status, expires_at, created_at,
        goal:shared_goals(id, name, target_amount),
        inviter_profile:user_profiles!goal_invitations_inviter_id_fkey(username, display_name)
      `)
      .eq('invitee_id', userProfile.id)
      .eq('status', InvitationStatus.PENDING)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.log("ERROR fetching invitations:", error);
      throw new Error(error.message);
    }

    // Transform the response
    const transformedData: InvitationResponse[] = (invitations || []).map(invitation => ({
      ...invitation,
      goal: Array.isArray(invitation.goal) ? invitation.goal[0] : invitation.goal,
      inviter_profile: Array.isArray(invitation.inviter_profile) ? invitation.inviter_profile[0] : invitation.inviter_profile
    }));

    return transformedData;
  }

  async acceptInvitation(invitationId: string, userId: string, authToken: string): Promise<void> {
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

    // Get invitation details
    const { data: invitation, error: invitationError } = await supabase
      .from('goal_invitations')
      .select('id, goal_id, invitee_id, status, expires_at')
      .eq('id', invitationId)
      .single();

    if (invitationError || !invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Verify user is the invitee
    if (invitation.invitee_id !== userProfile.id) {
      throw new ForbiddenException('You can only accept your own invitations');
    }

    // Check invitation status and expiration
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException('Invitation is no longer pending');
    }

    if (new Date(invitation.expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from('goal_invitations')
        .update({ status: InvitationStatus.EXPIRED })
        .eq('id', invitationId);

      throw new ConflictException('Invitation has expired');
    }

    // Get user's first budget for participation
    const { data: budget, error: budgetError } = await supabase
      .from('budgets')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (budgetError || !budget) {
      throw new NotFoundException('User must have at least one budget to join a goal');
    }

    // Start transaction: Add participant and update invitation status
    const { error: participantError } = await supabase
      .from('goal_participants')
      .insert([{
        goal_id: invitation.goal_id,
        user_profile_id: userProfile.id,
        budget_id: budget.id,
        status: ParticipantStatus.ACTIVE,
        joined_at: new Date().toISOString(),
      }]);

    if (participantError) {
      console.log("ERROR adding participant:", participantError);
      throw new Error(participantError.message);
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('goal_invitations')
      .update({ status: InvitationStatus.ACCEPTED })
      .eq('id', invitationId);

    if (updateError) {
      console.log("ERROR updating invitation status:", updateError);
      throw new Error(updateError.message);
    }
  }

  async declineInvitation(invitationId: string, userId: string, authToken: string): Promise<void> {
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

    // Get invitation details
    const { data: invitation, error: invitationError } = await supabase
      .from('goal_invitations')
      .select('id, invitee_id, status')
      .eq('id', invitationId)
      .single();

    if (invitationError || !invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Verify user is the invitee
    if (invitation.invitee_id !== userProfile.id) {
      throw new ForbiddenException('You can only decline your own invitations');
    }

    // Check invitation status
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException('Invitation is no longer pending');
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('goal_invitations')
      .update({ status: InvitationStatus.DECLINED })
      .eq('id', invitationId);

    if (updateError) {
      console.log("ERROR declining invitation:", updateError);
      throw new Error(updateError.message);
    }
  }

  // ===== PARTICIPANT MANAGEMENT METHODS =====

  async getGoalParticipants(goalId: string, userId: string, authToken: string): Promise<GoalParticipantResponse[]> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Verify user has access to this goal
    await this.findById(goalId, userId, authToken);

    // Get all active participants for the goal
    const { data: participants, error } = await supabase
      .from('goal_participants')
      .select(`
        id, goal_id, user_profile_id, monthly_contribution, category_id, budget_id, status, joined_at,
        user_profile:user_profiles(username, display_name)
      `)
      .eq('goal_id', goalId)
      .eq('status', ParticipantStatus.ACTIVE)
      .order('joined_at', { ascending: true });

    if (error) {
      console.log("ERROR fetching goal participants:", error);
      throw new Error(error.message);
    }

    // Transform the response
    const transformedData: GoalParticipantResponse[] = (participants || []).map(participant => ({
      ...participant,
      user_profile: Array.isArray(participant.user_profile) ? participant.user_profile[0] : participant.user_profile
    }));

    return transformedData;
  }

  async leaveGoal(goalId: string, userId: string, authToken: string): Promise<void> {
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

    // Verify goal exists and get goal details
    const goal = await this.findById(goalId, userId, authToken);

    // Check if user is the creator
    if (goal.created_by === userProfile.id) {
      throw new ForbiddenException('Goal creator cannot leave the goal. Delete the goal instead.');
    }

    // Find user's participation record
    const { data: participant, error: participantError } = await supabase
      .from('goal_participants')
      .select('id')
      .eq('goal_id', goalId)
      .eq('user_profile_id', userProfile.id)
      .eq('status', ParticipantStatus.ACTIVE)
      .single();

    if (participantError || !participant) {
      throw new NotFoundException('You are not an active participant in this goal');
    }

    // Update participant status to INACTIVE
    const { error: updateError } = await supabase
      .from('goal_participants')
      .update({ status: ParticipantStatus.INACTIVE })
      .eq('id', participant.id);

    if (updateError) {
      console.log("ERROR leaving goal:", updateError);
      throw new Error(updateError.message);
    }
  }

  async updateParticipant(goalId: string, updateParticipantDto: UpdateParticipantDto, userId: string, authToken: string): Promise<void> {
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

    // Verify goal exists and user has access
    await this.findById(goalId, userId, authToken);

    // Find user's participation record
    const { data: participant, error: participantError } = await supabase
      .from('goal_participants')
      .select('id, budget_id')
      .eq('goal_id', goalId)
      .eq('user_profile_id', userProfile.id)
      .eq('status', ParticipantStatus.ACTIVE)
      .single();

    if (participantError || !participant) {
      throw new NotFoundException('You are not an active participant in this goal');
    }

    // If category_id is provided, verify it belongs to the user's budget
    if (updateParticipantDto.category_id) {
      const { data: category, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('id', updateParticipantDto.category_id)
        .eq('budget_id', participant.budget_id)
        .single();

      if (categoryError || !category) {
        throw new ForbiddenException('Category does not exist or does not belong to your budget');
      }
    }

    // Update participant
    const { error: updateError } = await supabase
      .from('goal_participants')
      .update(updateParticipantDto)
      .eq('id', participant.id);

    if (updateError) {
      console.log("ERROR updating participant:", updateError);
      throw new Error(updateError.message);
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
