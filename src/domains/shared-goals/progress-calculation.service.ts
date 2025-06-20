import { Injectable } from '@nestjs/common';
import { GoalProgressResponse, ParticipantWithProgressResponse, SharedGoalResponse } from './dto/shared-goal.dto';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class ProgressCalculationService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async calculateGoalProgress(goalId: string, userId: string, authToken: string): Promise<GoalProgressResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get goal details with participants
    const { data: goal, error: goalError } = await supabase
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

    if (goalError || !goal) {
      console.log('Goal not found error:', goalError, 'Goal ID:', goalId);
      throw new Error('Goal not found');
    }

    // Calculate progress for each participant
    const participantsWithProgress: ParticipantWithProgressResponse[] = [];
    let totalCurrentAmount = 0;

    // First pass: collect all contributions to calculate total
    const participantContributions: { participant: any; contribution: number }[] = [];

    if (goal.participants && goal.participants.length > 0) {
      for (const participant of goal.participants) {
        if (participant.category_id) {
          // Get current category balance for this participant
          const contribution = await this.getParticipantContribution(
            participant.category_id,
            participant.budget_id,
            authToken
          );

          participantContributions.push({ participant, contribution });
          totalCurrentAmount += contribution;
        } else {
          // Participant without category selection
          participantContributions.push({ participant, contribution: 0 });
        }
      }

      // Second pass: calculate percentages based on total current amount
      for (const { participant, contribution } of participantContributions) {
        const contributionPercentage = totalCurrentAmount > 0
          ? (contribution / totalCurrentAmount) * 100
          : 0;

        participantsWithProgress.push({
          ...participant,
          user_profile: Array.isArray(participant.user_profile)
            ? participant.user_profile[0]
            : participant.user_profile,
          current_contribution: contribution,
          contribution_percentage: contributionPercentage,
        });
      }
    }

    const progressPercentage = goal.target_amount > 0 
      ? Math.min((totalCurrentAmount / goal.target_amount) * 100, 100)
      : 0;

    // Calculate projected completion date
    const projectedCompletionDate = this.projectCompletionDate(
      goal.target_amount,
      totalCurrentAmount,
      participantsWithProgress
    );

    // Check if goal status should be updated based on progress
    const shouldMarkCompleted = totalCurrentAmount >= goal.target_amount && goal.status !== 'COMPLETED';
    const shouldMarkActive = totalCurrentAmount < goal.target_amount && goal.status === 'COMPLETED';

    // Update goal status if it should be completed
    if (shouldMarkCompleted) {
      await this.updateGoalStatus(goal.id, 'COMPLETED', authToken);
      goal.status = 'COMPLETED';
    }
    // Update goal status back to active if progress dropped below 100%
    else if (shouldMarkActive) {
      await this.updateGoalStatus(goal.id, 'ACTIVE', authToken);
      goal.status = 'ACTIVE';
    }

    // Transform goal data
    const transformedGoal: SharedGoalResponse = {
      ...goal,
      creator_profile: Array.isArray(goal.creator_profile)
        ? goal.creator_profile[0]
        : goal.creator_profile,
      participants: participantsWithProgress,
      current_amount: totalCurrentAmount,
      progress_percentage: progressPercentage,
    };

    return {
      goal: transformedGoal,
      current_amount: totalCurrentAmount,
      progress_percentage: progressPercentage,
      projected_completion_date: projectedCompletionDate,
      participants_with_progress: participantsWithProgress,
    };
  }

  async getParticipantContribution(categoryId: string, budgetId: string, authToken: string): Promise<number> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get current month's category balance
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    const { data: balance, error } = await supabase
      .from('category_balances')
      .select('available')
      .eq('category_id', categoryId)
      .eq('budget_id', budgetId)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .single();

    if (error || !balance) {
      return 0;
    }

    // Return available balance (only positive amounts count toward goal)
    return Math.max(balance.available || 0, 0);
  }

  private projectCompletionDate(
    targetAmount: number,
    currentAmount: number,
    participants: ParticipantWithProgressResponse[]
  ): Date | undefined {
    if (currentAmount >= targetAmount) {
      return new Date(); // Already completed
    }

    // Calculate total monthly contributions
    const totalMonthlyContribution = participants.reduce((sum, participant) => {
      return sum + (participant.monthly_contribution || 0);
    }, 0);

    if (totalMonthlyContribution <= 0) {
      return undefined; // Cannot project without monthly contributions
    }

    const remainingAmount = targetAmount - currentAmount;
    const monthsToCompletion = Math.ceil(remainingAmount / totalMonthlyContribution);

    const projectedDate = new Date();
    projectedDate.setMonth(projectedDate.getMonth() + monthsToCompletion);

    return projectedDate;
  }

  async getGoalWithProgress(goalId: string, userId: string, authToken: string): Promise<SharedGoalResponse> {
    const progressData = await this.calculateGoalProgress(goalId, userId, authToken);
    return progressData.goal;
  }

  private async updateGoalStatus(goalId: string, status: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    const { error } = await supabase
      .from('shared_goals')
      .update({ status })
      .eq('id', goalId);

    if (error) {
      console.error('Error updating goal status:', error);
      // Don't throw error to avoid breaking progress calculation
    }
  }
}
