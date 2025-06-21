import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  CreateInvitationDto,
  InvitationResponse,
  UpdateParticipantDto,
  GoalParticipantResponse,
  InvitationStatus
} from './dto/shared-goal.dto';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class SharedGoalsCollaborationService {
  constructor(
    private supabaseService: SupabaseService
  ) {}

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
    const { data: goal, error: goalError } = await supabase
      .from('shared_goals')
      .select('id, created_by')
      .eq('id', goalId)
      .single();

    if (goalError || !goal) {
      throw new NotFoundException('Goal not found');
    }

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
      // Return empty array if no profile exists - this is expected for new users
      return [];
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
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError || !userProfile) {
      throw new NotFoundException('User profile not found');
    }

    const { data: goal, error: goalError } = await supabase
      .from('shared_goals')
      .select('id, created_by, participants:goal_participants(user_profile_id)')
      .eq('id', goalId)
      .single();

    if (goalError || !goal) {
      throw new NotFoundException('Goal not found');
    }

    // Check if user has access to this goal
    const hasAccess = goal.created_by === userProfile.id ||
      goal.participants?.some(p => p.user_profile_id === userProfile.id);

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this goal');
    }

    // Get all participants for the goal
    const { data: participants, error } = await supabase
      .from('goal_participants')
      .select(`
        id, goal_id, user_profile_id, monthly_contribution, category_id, budget_id, joined_at,
        user_profile:user_profiles(username, display_name)
      `)
      .eq('goal_id', goalId)
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
    const { data: goal, error: goalError } = await supabase
      .from('shared_goals')
      .select('id, created_by, participants:goal_participants(user_profile_id)')
      .eq('id', goalId)
      .single();

    if (goalError || !goal) {
      throw new NotFoundException('Goal not found');
    }

    // Check if user has access to this goal
    const hasAccess = goal.created_by === userProfile.id ||
      goal.participants?.some(p => p.user_profile_id === userProfile.id);

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this goal');
    }

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
      .single();

    if (participantError || !participant) {
      throw new NotFoundException('You are not a participant in this goal');
    }

    // Delete the participant record (hard delete)
    const { error: deleteError } = await supabase
      .from('goal_participants')
      .delete()
      .eq('id', participant.id);

    if (deleteError) {
      console.log("ERROR leaving goal:", deleteError);
      throw new Error(deleteError.message);
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
    const { data: goal, error: goalError } = await supabase
      .from('shared_goals')
      .select('id, created_by, participants:goal_participants(user_profile_id)')
      .eq('id', goalId)
      .single();

    if (goalError || !goal) {
      throw new NotFoundException('Goal not found');
    }

    // Check if user has access to this goal
    const hasAccess = goal.created_by === userProfile.id ||
      goal.participants?.some(p => p.user_profile_id === userProfile.id);

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this goal');
    }

    // Find user's participation record
    const { data: participant, error: participantError } = await supabase
      .from('goal_participants')
      .select('id, budget_id')
      .eq('goal_id', goalId)
      .eq('user_profile_id', userProfile.id)
      .single();

    if (participantError || !participant) {
      throw new NotFoundException('You are not a participant in this goal');
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

  async removeParticipant(goalId: string, participantId: string, userId: string, authToken: string): Promise<void> {
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
    const { data: goal, error: goalError } = await supabase
      .from('shared_goals')
      .select('id, created_by, participants:goal_participants(user_profile_id)')
      .eq('id', goalId)
      .single();

    if (goalError || !goal) {
      throw new NotFoundException('Goal not found');
    }

    // Check if user has access to this goal
    const hasAccess = goal.created_by === userProfile.id ||
      goal.participants?.some(p => p.user_profile_id === userProfile.id);

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this goal');
    }

    // Check if user is the creator (only creators can remove participants)
    if (goal.created_by !== userProfile.id) {
      throw new ForbiddenException('Only the goal creator can remove participants');
    }

    // Get the participant to be removed
    const { data: participant, error: participantError } = await supabase
      .from('goal_participants')
      .select('id, user_profile_id, user_profile:user_profiles(username, display_name)')
      .eq('id', participantId)
      .eq('goal_id', goalId)
      .single();

    if (participantError || !participant) {
      throw new NotFoundException('Participant not found in this goal');
    }

    // Prevent creator from removing themselves (they should delete the goal instead)
    if (participant.user_profile_id === userProfile.id) {
      throw new ForbiddenException('Goal creator cannot remove themselves. Delete the goal instead.');
    }

    // Delete the participant record (hard delete)
    const { error: deleteError } = await supabase
      .from('goal_participants')
      .delete()
      .eq('id', participantId);

    if (deleteError) {
      console.log("ERROR removing participant:", deleteError);
      throw new Error(deleteError.message);
    }
  }
}
