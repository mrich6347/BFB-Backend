import { Injectable } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service';
import { MainDataResponse } from './DTO/mainData.dto';
import { AccountsService } from '../accounts/accounts.service';
import { CategoryGroupsService } from '../category-groups/category-groups.service';
import { CategoryReadService } from '../categories/services/read/category-read.service';
import { CategoryBalancesService } from '../category-balances/category-balances.service';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';
import { TransactionsService } from '../transactions/transactions.service';
import { AutoAssignService } from '../auto-assign/auto-assign.service';
import { UserProfilesService } from '../user-profiles/user-profiles.service';
import { SharedGoalsService } from '../shared-goals/shared-goals.service';
import { SharedGoalsCollaborationService } from '../shared-goals/shared-goals-collaboration.service';
import { PayeesService } from '../payees/payees.service';
import { ScheduledTransactionsService } from '../scheduled-transactions/scheduled-transactions.service';
import { UserDateContextUtils, WithUserDateContext } from '../../common/interfaces/user-date-context.interface';
import { SupabaseService } from '../../supabase/supabase.service';
import { RetirementSettingsService } from '../retirement-settings/retirement-settings.service';

@Injectable()
export class MainDataService {
    constructor(
        private readonly budgetsService: BudgetsService,
        private readonly accountsService: AccountsService,
        private readonly categoryGroupsService: CategoryGroupsService,
        private readonly categoryReadService: CategoryReadService,
        private readonly categoryBalancesService: CategoryBalancesService,
        private readonly readyToAssignService: ReadyToAssignService,
        private readonly transactionsService: TransactionsService,
        private readonly autoAssignService: AutoAssignService,
        private readonly userProfilesService: UserProfilesService,
        private readonly sharedGoalsService: SharedGoalsService,
        private readonly sharedGoalsCollaborationService: SharedGoalsCollaborationService,
        private readonly payeesService: PayeesService,
        private readonly scheduledTransactionsService: ScheduledTransactionsService,
        private readonly supabaseService: SupabaseService,
        private readonly retirementSettingsService: RetirementSettingsService
    ) {}

    async getMainData(budgetId: string, authToken: string, userId: string, userDateContext?: WithUserDateContext): Promise<MainDataResponse> {
        // First, check if we need to roll over to current month
        await this.checkAndHandleMonthRollover(budgetId, userId, authToken, userDateContext);

        const [budget, accounts, categoryGroups, categories, categoryBalances, transactions, readyToAssign, autoAssignConfigurations, userProfile, sharedGoals, invitations, payees, scheduledTransactions, retirementSettings] = await Promise.all([
            this.budgetsService.findOne(budgetId, userId, authToken),
            this.accountsService.findAll(userId, authToken, budgetId),
            this.categoryGroupsService.findAll(budgetId, userId, authToken),
            this.categoryReadService.findAllByBudgetWithoutBalances(budgetId, userId, authToken),
            this.categoryBalancesService.findAllByBudget(budgetId, userId, authToken, userDateContext), // Now only returns current month
            this.transactionsService.findAllByBudget(budgetId, userId, authToken),
            this.readyToAssignService.calculateReadyToAssign(budgetId, userId, authToken),
            this.autoAssignService.findAllByBudget(budgetId, userId, authToken),
            this.userProfilesService.findByUserId(userId, authToken),
            this.sharedGoalsService.findByUserId(userId, budgetId, authToken),
            this.sharedGoalsCollaborationService.getInvitations(userId, authToken),
            this.payeesService.findByBudget(budgetId, userId, authToken),
            this.scheduledTransactionsService.findAllByBudget(budgetId, userId, authToken),
            this.retirementSettingsService.getRetirementSettings(budgetId, userId, authToken)
        ]);


        return {
           budget,
           accounts,
           categoryGroups,
           categories,
           categoryBalances,
           transactions,
           readyToAssign,
           autoAssignConfigurations,
           userProfile: userProfile || undefined,
           sharedGoals,
           invitations,
           payees,
           scheduledTransactions,
           retirementSettings: retirementSettings || undefined
        }
    }

    private async checkAndHandleMonthRollover(budgetId: string, userId: string, authToken: string, userDateContext?: WithUserDateContext): Promise<void> {
        // Get current year and month (use user context if provided)
        const { year: currentYear, month: currentMonth } = UserDateContextUtils.getCurrentUserDate(userDateContext);

        // Check if current month balances exist
        const currentMonthBalances = await this.categoryBalancesService.findByBudgetAndMonth(
            budgetId,
            currentYear,
            currentMonth,
            userId,
            authToken
        );

        // If current month balances don't exist, we need to roll over from previous month
        if (!currentMonthBalances || currentMonthBalances.length === 0) {
            await this.rolloverToPreviousMonth(budgetId, userId, authToken, currentYear, currentMonth);
        }
    }

    private async rolloverToPreviousMonth(budgetId: string, userId: string, authToken: string, currentYear: number, currentMonth: number): Promise<void> {
        // Calculate previous month
        let prevYear = currentYear;
        let prevMonth = currentMonth - 1;

        if (prevMonth === 0) {
            prevMonth = 12;
            prevYear -= 1;
        }

        // Get previous month balances
        const previousMonthBalances = await this.categoryBalancesService.findByBudgetAndMonth(
            budgetId,
            prevYear,
            prevMonth,
            userId,
            authToken
        );

        // Get all categories for this budget
        const categories = await this.categoryReadService.findAllByBudgetWithoutBalances(budgetId, userId, authToken);

        // Create current month balances
        const newBalances = categories.map(category => {
            // Find previous month balance for this category
            const prevBalance = previousMonthBalances.find(b => b.category_id === category.id);

            return {
                category_id: category.id,
                budget_id: budgetId,
                user_id: userId,
                year: currentYear,
                month: currentMonth,
                assigned: 0, // Reset assigned to 0
                activity: 0, // Reset activity to 0
                available: prevBalance?.available || 0 // Carry over available balance (positive or negative)
            };
        });

        // Insert new balances if there are any
        if (newBalances.length > 0) {
            await this.categoryBalancesService.createMultiple(newBalances, authToken);
        }
    }

    /**
     * Get the most recent update timestamp across all budget-related tables
     * This is used to detect if data has changed while the app was in the background
     */
    async getLastUpdateTimestamp(budgetId: string, authToken: string, userId: string): Promise<{ lastUpdate: string }> {
        const supabase = this.supabaseService.getAuthenticatedClient(authToken);

        // Query the most recent updated_at timestamp across all relevant tables
        const { data, error } = await supabase.rpc('get_budget_last_update', {
            p_budget_id: budgetId,
            p_user_id: userId
        });

        if (error) {
            throw new Error(`Failed to get last update timestamp: ${error.message}`);
        }

        return { lastUpdate: data || new Date().toISOString() };
    }
}
