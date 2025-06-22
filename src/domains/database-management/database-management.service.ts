import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DatabaseManagementService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async nukeDatabase(userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Get all tables that have user data
    const tables = await this.getUserTables(supabase);

    // Delete ALL data from each table for ALL users (complete nuke)
    for (const table of tables) {
      await this.clearEntireTable(supabase, table);
    }
  }

  async populateDatabase(userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // First, clear existing data
    await this.nukeDatabase(userId, authToken);

    // Create comprehensive sample data
    await this.createSampleData(userId, authToken);
  }

  private async getUserTables(supabase: SupabaseClient): Promise<string[]> {
    // These are the tables we know have user data and should be cleared
    // The order is important to avoid foreign key constraint errors
    // Delete child tables first, then parent tables
    return [
      'transactions',           // Must be first - references accounts and categories
      'category_balances',      // References categories
      'auto_assign_configurations', // References categories and budgets
      'goal_participants',      // References shared_goals, user_profiles, categories, and budgets
      'goal_invitations',       // References shared_goals and user_profiles
      'categories',             // References category_groups and budgets
      'category_groups',        // References budgets
      'accounts',               // References budgets
      'shared_goals',           // References user_profiles
      'budgets',                // References user_profiles
      'user_profiles'           // Parent table - delete last
    ];
  }

  private async clearEntireTable(supabase: SupabaseClient, table: string): Promise<void> {
    try {
      console.log(`Nuking all data from table: ${table}`);

      // Delete ALL data from the table (no user filtering)
      const { error } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // This condition will match all rows since no ID will be this value

      if (error) {
        console.error(`Error clearing table ${table}:`, error);
        throw new Error(`Failed to clear table ${table}: ${error.message}`);
      }

      console.log(`Successfully nuked all data from table: ${table}`);
    } catch (error) {
      console.error(`Error clearing table ${table}:`, error);
      throw error;
    }
  }

  private async clearTableForUser(supabase: SupabaseClient, table: string, userId: string): Promise<void> {
    try {
      // Handle tables with different column structures
      switch (table) {
        case 'goal_participants':
          await this.clearGoalParticipants(supabase, userId);
          break;

        case 'goal_invitations':
          await this.clearGoalInvitations(supabase, userId);
          break;

        case 'shared_goals':
          await this.clearSharedGoals(supabase, userId);
          break;

        default:
          // Standard case for tables with user_id column
          const { error } = await supabase
            .from(table)
            .delete()
            .eq('user_id', userId);

          if (error) {
            console.error(`Error clearing table ${table}:`, error);
            throw new Error(`Failed to clear table ${table}: ${error.message}`);
          }
          break;
      }
    } catch (error) {
      console.error(`Error clearing table ${table}:`, error);
      throw new Error(`Failed to clear table ${table}: ${error.message}`);
    }
  }

  private async clearGoalParticipants(supabase: SupabaseClient, userId: string): Promise<void> {
    // First get the user's profile ID
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new Error(`Failed to get user profile: ${profileError.message}`);
    }

    if (userProfile) {
      const { error } = await supabase
        .from('goal_participants')
        .delete()
        .eq('user_profile_id', userProfile.id);

      if (error) {
        throw new Error(`Failed to clear goal_participants: ${error.message}`);
      }
    }
  }

  private async clearGoalInvitations(supabase: SupabaseClient, userId: string): Promise<void> {
    // First get the user's profile ID
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new Error(`Failed to get user profile: ${profileError.message}`);
    }

    if (userProfile) {
      // Clear invitations where user is either inviter or invitee
      const { error } = await supabase
        .from('goal_invitations')
        .delete()
        .or(`inviter_id.eq.${userProfile.id},invitee_id.eq.${userProfile.id}`);

      if (error) {
        throw new Error(`Failed to clear goal_invitations: ${error.message}`);
      }
    }
  }

  private async clearSharedGoals(supabase: SupabaseClient, userId: string): Promise<void> {
    // First get the user's profile ID
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new Error(`Failed to get user profile: ${profileError.message}`);
    }

    if (userProfile) {
      const { error } = await supabase
        .from('shared_goals')
        .delete()
        .eq('created_by', userProfile.id);

      if (error) {
        throw new Error(`Failed to clear shared_goals: ${error.message}`);
      }
    }
  }

  private async createSampleData(userId: string, authToken: string): Promise<void> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);

    // Create budget
    const budget = await this.createSampleBudget(supabase, userId);

    // Clear any default categories/category groups created by triggers
    await this.clearDefaultCategoriesAfterBudgetCreation(supabase, userId, budget.id);

    // Create accounts
    const accounts = await this.createSampleAccounts(supabase, userId, budget.id);

    // Create category groups and categories
    const { categories } = await this.createSampleCategories(supabase, userId, budget.id);

    // Create historical transactions and balances for multiple months
    await this.createHistoricalData(supabase, userId, budget.id, accounts, categories);

    // Create auto-assign configurations
    await this.createSampleAutoAssignConfigurations(supabase, userId, budget.id, categories);

    // Create user profile and shared goals data
    await this.createSharedGoalsData(supabase, userId, budget.id, categories);
  }

  private async createSampleBudget(supabase: SupabaseClient, userId: string): Promise<any> {
    const budgetPayload = {
      id: uuidv4(),
      user_id: userId,
      name: 'My Sample Budget',
      currency: 'USD',
      currency_placement: 'BEFORE',
      date_format: 'US_SLASH',
      number_format: 'DOT_COMMA'
    };

    const { data, error } = await supabase
      .from('budgets')
      .insert([budgetPayload])
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create sample budget: ${error.message}`);
    }

    return data;
  }

  private async clearDefaultCategoriesAfterBudgetCreation(supabase: SupabaseClient, userId: string, budgetId: string): Promise<void> {
    // Clear any default categories created by database triggers when the budget was created
    // This ensures we start with a clean slate for our custom categories

    // First clear category balances for this budget
    const { error: balanceError } = await supabase
      .from('category_balances')
      .delete()
      .eq('budget_id', budgetId)
      .eq('user_id', userId);

    if (balanceError) {
      console.error('Error clearing default category balances:', balanceError);
    }

    // Then clear categories for this budget
    const { error: categoryError } = await supabase
      .from('categories')
      .delete()
      .eq('budget_id', budgetId)
      .eq('user_id', userId);

    if (categoryError) {
      console.error('Error clearing default categories:', categoryError);
    }

    // Finally clear category groups for this budget
    const { error: groupError } = await supabase
      .from('category_groups')
      .delete()
      .eq('budget_id', budgetId)
      .eq('user_id', userId);

    if (groupError) {
      console.error('Error clearing default category groups:', groupError);
    }
  }

  private async createSampleAccounts(supabase: SupabaseClient, userId: string, budgetId: string): Promise<any[]> {
    const accountsData = [
      // Cash Accounts
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Wells Fargo Checking',
        account_type: 'CASH',
        account_balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
        working_balance: 0,
        is_active: true,
        display_order: 1
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Citi Emergency Fund',
        account_type: 'CASH',
        account_balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
        working_balance: 0,
        is_active: true,
        display_order: 2
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'House Savings',
        account_type: 'CASH',
        account_balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
        working_balance: 0,
        is_active: true,
        display_order: 3
      },
      // Credit Card Accounts
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Citi Double Cash',
        account_type: 'CREDIT',
        account_balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
        working_balance: 0,
        is_active: true,
        display_order: 4
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Apple Pay CC',
        account_type: 'CREDIT',
        account_balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
        working_balance: 0,
        is_active: true,
        display_order: 5
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Prime CC',
        account_type: 'CREDIT',
        account_balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
        working_balance: 0,
        is_active: true,
        display_order: 6
      },
      // Tracking Accounts
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Fidelity Roth IRA',
        account_type: 'TRACKING',
        account_balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
        working_balance: 0,
        is_active: true,
        display_order: 7
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Fidelity Taxable',
        account_type: 'TRACKING',
        account_balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
        working_balance: 0,
        is_active: true,
        display_order: 8
      }
    ];

    const { data, error } = await supabase
      .from('accounts')
      .insert(accountsData)
      .select('*');

    if (error) {
      throw new Error(`Failed to create sample accounts: ${error.message}`);
    }

    return data;
  }

  private async createSampleCategories(supabase: SupabaseClient, userId: string, budgetId: string): Promise<{ categoryGroups: any[], categories: any[] }> {
    // Create category groups based on your YNAB layout
    const categoryGroupsData = [
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Primary Bills',
        display_order: 1,
        is_system_group: false
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Subscriptions',
        display_order: 2,
        is_system_group: false
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Monthly Living Expenses',
        display_order: 3,
        is_system_group: false
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Savings',
        display_order: 4,
        is_system_group: false
      },
      // Credit Card Payments system group
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Credit Card Payments',
        display_order: 5,
        is_system_group: true
      }
    ];

    const { data: categoryGroups, error: groupError } = await supabase
      .from('category_groups')
      .insert(categoryGroupsData)
      .select('*');

    if (groupError) {
      throw new Error(`Failed to create sample category groups: ${groupError.message}`);
    }

    // Create categories for each group
    const primaryBillsGroup = categoryGroups.find(g => g.name === 'Primary Bills');
    const subscriptionsGroup = categoryGroups.find(g => g.name === 'Subscriptions');
    const monthlyLivingGroup = categoryGroups.find(g => g.name === 'Monthly Living Expenses');
    const savingsGroup = categoryGroups.find(g => g.name === 'Savings');
    const creditCardPaymentsGroup = categoryGroups.find(g => g.name === 'Credit Card Payments');

    const categoriesData = [
      // Primary Bills
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: primaryBillsGroup.id, name: 'Rent', display_order: 1 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: primaryBillsGroup.id, name: 'Auto Insurance', display_order: 2 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: primaryBillsGroup.id, name: 'Visible Phone Plan', display_order: 3 },

      // Subscriptions
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: subscriptionsGroup.id, name: 'Zwift', display_order: 1 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: subscriptionsGroup.id, name: 'YouTube', display_order: 2 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: subscriptionsGroup.id, name: 'Augment Code', display_order: 3 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: subscriptionsGroup.id, name: 'YNAB', display_order: 4 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: subscriptionsGroup.id, name: 'iCloud Storage', display_order: 5 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: subscriptionsGroup.id, name: 'Cursor Pro', display_order: 6 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: subscriptionsGroup.id, name: 'Prime', display_order: 7 },

      // Monthly Living Expenses
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyLivingGroup.id, name: 'House Fund', display_order: 1 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyLivingGroup.id, name: 'Retirement Fund', display_order: 2 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyLivingGroup.id, name: 'Groceries', display_order: 3 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyLivingGroup.id, name: 'Gas', display_order: 4 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyLivingGroup.id, name: 'Random Spending', display_order: 5 },

      // Savings
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: savingsGroup.id, name: 'Four Month Emergency Fund', display_order: 1 }

      // Note: Credit Card Payment Categories are automatically created by database triggers when credit accounts are created
    ];

    const { data: categories, error: categoryError } = await supabase
      .from('categories')
      .insert(categoriesData)
      .select('*');

    if (categoryError) {
      throw new Error(`Failed to create sample categories: ${categoryError.message}`);
    }

    return { categoryGroups, categories };
  }

  private async createHistoricalData(supabase: SupabaseClient, userId: string, budgetId: string, accounts: any[], categories: any[]): Promise<void> {
    // Only create category balances for the current month with all values set to 0
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    await this.createCurrentMonthBalances(supabase, userId, budgetId, currentYear, currentMonth, categories);

    // Update tracking accounts with some historical changes for chart data
    await this.updateTrackingAccounts(supabase, userId, accounts.filter(a => a.account_type === 'TRACKING'));
  }

  private async createCurrentMonthBalances(supabase: SupabaseClient, userId: string, budgetId: string, year: number, month: number, categories: any[]): Promise<void> {
    // Create category balances for current month with all values set to 0 (blank)
    const categoryBalances: any[] = [];

    for (const category of categories) {
      categoryBalances.push({
        category_id: category.id,
        budget_id: budgetId,
        user_id: userId,
        year: year,
        month: month,
        assigned: 0,
        activity: 0,
        available: 0
      });
    }

    // Insert category balances
    if (categoryBalances.length > 0) {
      const { error: balanceError } = await supabase
        .from('category_balances')
        .insert(categoryBalances);

      if (balanceError) {
        throw new Error(`Failed to create category balances for ${year}-${month}: ${balanceError.message}`);
      }
    }
  }

  private getRandomPayee(categoryName: string): string {
    const payeeMap: { [key: string]: string[] } = {
      // Primary Bills
      'Rent': ['Property Management Co', 'Landlord', 'Rent Payment'],
      'Auto Insurance': ['State Farm', 'Geico', 'Progressive', 'Allstate'],
      'Visible Phone Plan': ['Visible', 'Verizon Visible'],

      // Subscriptions
      'Zwift': ['Zwift'],
      'YouTube': ['YouTube Premium', 'Google'],
      'Augment Code': ['Augment Code'],
      'YNAB': ['YNAB', 'You Need A Budget'],
      'iCloud Storage': ['Apple', 'iCloud'],
      'Cursor Pro': ['Cursor'],
      'Prime': ['Amazon Prime', 'Amazon'],

      // Monthly Living Expenses
      'House Fund': ['House Fund Transfer', 'Savings Transfer'],
      'Retirement Fund': ['Fidelity', 'Retirement Transfer', '401k Contribution'],
      'Groceries': ['Kroger', 'Walmart', 'Target', 'Whole Foods', 'Costco'],
      'Gas': ['Shell', 'Exxon', 'BP', 'Chevron', 'Speedway'],
      'Random Spending': ['Amazon', 'Target', 'Walmart', 'Various Stores'],

      // Savings
      'Four Month Emergency Fund': ['Emergency Fund Transfer', 'Savings Transfer'],

      // Note: Credit Card Payment categories are system-managed and don't need payees
    };

    const payees = payeeMap[categoryName] || ['Generic Store'];
    return payees[Math.floor(Math.random() * payees.length)];
  }

  private async updateTrackingAccounts(supabase: SupabaseClient, userId: string, trackingAccounts: any[]): Promise<void> {
    // Create comprehensive historical transactions for tracking accounts to show rich chart data
    const transactions: any[] = [];

    // Generate data for the last 18 months for more comprehensive charts
    const currentDate = new Date();
    const months: Array<{ year: number; month: number; date: Date }> = [];

    for (let i = 17; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      months.push({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        date: date
      });
    }

    for (const account of trackingAccounts) {
      if (account.name === 'Fidelity Roth IRA') {
        // Create realistic Roth IRA changes with market volatility
        let runningBalance = 45000; // Starting balance

        for (let i = 0; i < months.length; i++) {
          const monthData = months[i];
          const dateStr = `${monthData.year}-${monthData.month.toString().padStart(2, '0')}`;

          // Simulate market volatility with different scenarios
          let monthlyChanges: Array<{ amount: number; memo: string; day: number }> = [];

          if (i < 6) {
            // First 6 months: Bull market with occasional corrections
            monthlyChanges = [
              { amount: Math.floor(Math.random() * 1000) + 800, memo: 'Market gains', day: 5 },
              { amount: Math.floor(Math.random() * 500) + 200, memo: 'Dividend reinvestment', day: 15 },
              { amount: Math.floor(Math.random() * 300) + 100, memo: 'Stock appreciation', day: 25 }
            ];

            // Occasional correction
            if (Math.random() < 0.3) {
              monthlyChanges.push({ amount: -(Math.floor(Math.random() * 800) + 400), memo: 'Market correction', day: 20 });
            }
          } else if (i < 12) {
            // Next 6 months: More volatile with some bear market
            monthlyChanges = [
              { amount: Math.floor(Math.random() * 600) - 300, memo: 'Market volatility', day: 8 },
              { amount: Math.floor(Math.random() * 400) + 100, memo: 'Dividend payment', day: 15 },
              { amount: Math.floor(Math.random() * 800) - 400, memo: 'Portfolio rebalancing', day: 22 }
            ];

            // Higher chance of losses
            if (Math.random() < 0.5) {
              monthlyChanges.push({ amount: -(Math.floor(Math.random() * 1200) + 600), memo: 'Bear market decline', day: 12 });
            }
          } else {
            // Last 6 months: Recovery and growth
            monthlyChanges = [
              { amount: Math.floor(Math.random() * 1200) + 600, memo: 'Recovery gains', day: 7 },
              { amount: Math.floor(Math.random() * 400) + 200, memo: 'Dividend reinvestment', day: 15 },
              { amount: Math.floor(Math.random() * 800) + 300, memo: 'Strong performance', day: 28 }
            ];

            // Add some additional contributions
            if (Math.random() < 0.4) {
              monthlyChanges.push({ amount: Math.floor(Math.random() * 1000) + 500, memo: 'Additional investment', day: 1 });
            }
          }

          // Add all changes for this month
          for (const change of monthlyChanges) {
            transactions.push({
              id: uuidv4(),
              user_id: userId,
              account_id: account.id,
              date: `${dateStr}-${change.day.toString().padStart(2, '0')}`,
              amount: change.amount,
              payee: 'Investment Broker',
              memo: change.memo,
              category_id: null,
              is_cleared: true,
              is_reconciled: false
            });
            runningBalance += change.amount;
          }
        }
      } else if (account.name === 'Fidelity Taxable') {
        // Create realistic taxable investment account changes
        let accountValue = 25000; // Starting value

        for (let i = 0; i < months.length; i++) {
          const monthData = months[i];
          const dateStr = `${monthData.year}-${monthData.month.toString().padStart(2, '0')}`;

          // Create similar investment patterns but for taxable account
          let monthlyChanges: Array<{ amount: number; memo: string; day: number }> = [];

          if (i < 6) {
            // First 6 months: Steady growth with dividends
            monthlyChanges = [
              { amount: Math.floor(Math.random() * 800) + 400, memo: 'Market gains', day: 5 },
              { amount: Math.floor(Math.random() * 300) + 100, memo: 'Dividend payment', day: 15 },
              { amount: Math.floor(Math.random() * 200) + 100, memo: 'Stock appreciation', day: 25 }
            ];

            // Occasional correction
            if (Math.random() < 0.2) {
              monthlyChanges.push({ amount: -(Math.floor(Math.random() * 600) + 300), memo: 'Market correction', day: 20 });
            }
          } else if (i < 12) {
            // Next 6 months: More volatile
            monthlyChanges = [
              { amount: Math.floor(Math.random() * 500) - 250, memo: 'Market volatility', day: 8 },
              { amount: Math.floor(Math.random() * 300) + 100, memo: 'Dividend payment', day: 15 },
              { amount: Math.floor(Math.random() * 600) - 300, memo: 'Portfolio rebalancing', day: 22 }
            ];

            // Higher chance of losses
            if (Math.random() < 0.4) {
              monthlyChanges.push({ amount: -(Math.floor(Math.random() * 800) + 400), memo: 'Market decline', day: 12 });
            }
          } else {
            // Last 6 months: Recovery and growth
            monthlyChanges = [
              { amount: Math.floor(Math.random() * 1000) + 500, memo: 'Recovery gains', day: 7 },
              { amount: Math.floor(Math.random() * 300) + 150, memo: 'Dividend payment', day: 15 },
              { amount: Math.floor(Math.random() * 600) + 200, memo: 'Strong performance', day: 28 }
            ];

            // Add some additional contributions
            if (Math.random() < 0.3) {
              monthlyChanges.push({ amount: Math.floor(Math.random() * 800) + 400, memo: 'Additional investment', day: 1 });
            }
          }

          // Add all changes for this month
          for (const change of monthlyChanges) {
            transactions.push({
              id: uuidv4(),
              user_id: userId,
              account_id: account.id,
              date: `${dateStr}-${change.day.toString().padStart(2, '0')}`,
              amount: change.amount,
              payee: 'Fidelity',
              memo: change.memo,
              category_id: null,
              is_cleared: true,
              is_reconciled: false
            });
            accountValue += change.amount;
          }
        }
      }
    }

    // Insert tracking account transactions
    if (transactions.length > 0) {
      const { error } = await supabase
        .from('transactions')
        .insert(transactions);

      if (error) {
        throw new Error(`Failed to create tracking account transactions: ${error.message}`);
      }
    }
  }

  private async createSampleAutoAssignConfigurations(supabase: SupabaseClient, userId: string, budgetId: string, categories: any[]): Promise<void> {
    // Create auto-assign configurations based on your YNAB layout
    const configurations = [
      {
        name: 'Primary Bills',
        items: [
          { category_name: 'Rent', amount: 1800 },
          { category_name: 'Auto Insurance', amount: 150 },
          { category_name: 'Visible Phone Plan', amount: 40 }
        ]
      },
      {
        name: 'All Subscriptions',
        items: [
          { category_name: 'Zwift', amount: 15 },
          { category_name: 'YouTube', amount: 12 },
          { category_name: 'Augment Code', amount: 50 },
          { category_name: 'YNAB', amount: 14 },
          { category_name: 'iCloud Storage', amount: 3 },
          { category_name: 'Cursor Pro', amount: 20 },
          { category_name: 'Prime', amount: 15 }
        ]
      },
      {
        name: 'Living Expenses',
        items: [
          { category_name: 'Groceries', amount: 600 },
          { category_name: 'Gas', amount: 200 },
          { category_name: 'Random Spending', amount: 300 }
        ]
      },
      {
        name: 'Savings & Investments',
        items: [
          { category_name: 'House Fund', amount: 500 },
          { category_name: 'Retirement Fund', amount: 1000 },
          { category_name: 'Four Month Emergency Fund', amount: 800 }
        ]
      },
      {
        name: 'Complete Monthly Budget',
        items: [
          { category_name: 'Rent', amount: 1800 },
          { category_name: 'Auto Insurance', amount: 150 },
          { category_name: 'Groceries', amount: 600 },
          { category_name: 'Gas', amount: 200 },
          { category_name: 'House Fund', amount: 500 },
          { category_name: 'Retirement Fund', amount: 1000 }
        ]
      }
    ];

    // Create a map of category names to IDs for easy lookup
    const categoryMap = new Map();
    categories.forEach(category => {
      categoryMap.set(category.name, category.id);
    });

    // Insert each configuration
    for (const config of configurations) {
      const configItems: Array<{
        id: string;
        name: string;
        budget_id: string;
        user_id: string;
        category_id: string;
        amount: number;
      }> = [];

      for (const item of config.items) {
        const categoryId = categoryMap.get(item.category_name);
        if (categoryId) {
          configItems.push({
            id: uuidv4(),
            name: config.name,
            budget_id: budgetId,
            user_id: userId,
            category_id: categoryId,
            amount: item.amount
          });
        }
      }

      if (configItems.length > 0) {
        const { error } = await supabase
          .from('auto_assign_configurations')
          .insert(configItems);

        if (error) {
          throw new Error(`Failed to create auto-assign configuration '${config.name}': ${error.message}`);
        }
      }
    }
  }

  private async createSharedGoalsData(supabase: SupabaseClient, userId: string, budgetId: string, categories: any[]): Promise<void> {
    // First, ensure the current user has a profile
    const currentUserProfile = await this.ensureUserProfile(supabase, userId);

    // Create shared goals (3 active, 3 completed) - all owned by current user
    const sharedGoals = await this.createSampleSharedGoals(supabase, currentUserProfile.id);

    // Add the current user as participant to all goals
    await this.createGoalParticipants(supabase, sharedGoals, currentUserProfile, budgetId, categories);

    // Note: Not creating completed goal balances since we want all category balances to remain at 0
  }

  private async ensureUserProfile(supabase: SupabaseClient, userId: string): Promise<any> {
    // Check if user already has a profile
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existingProfile) {
      return existingProfile;
    }

    // Create a profile for the current user
    const profilePayload = {
      id: uuidv4(),
      user_id: userId,
      username: 'demo_user',
      display_name: 'Demo User'
    };

    const { data, error } = await supabase
      .from('user_profiles')
      .insert([profilePayload])
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create user profile: ${error.message}`);
    }

    return data;
  }



  private async createSampleSharedGoals(supabase: SupabaseClient, creatorProfileId: string): Promise<any[]> {
    const currentDate = new Date();
    const futureDate = new Date();
    futureDate.setMonth(currentDate.getMonth() + 12);

    const pastDate = new Date();
    pastDate.setMonth(currentDate.getMonth() - 2);

    const goalsData = [
      // Active Goals (3)
      {
        id: uuidv4(),
        name: 'Family Vacation to Europe',
        description: 'Saving for a 2-week family trip to Europe including flights, hotels, and activities',
        target_amount: 8500.00,
        target_date: futureDate.toISOString().split('T')[0],
        created_by: creatorProfileId,
        status: 'ACTIVE'
      },
      {
        id: uuidv4(),
        name: 'Emergency Fund',
        description: 'Building a 6-month emergency fund for financial security',
        target_amount: 15000.00,
        target_date: null,
        created_by: creatorProfileId,
        status: 'ACTIVE'
      },
      {
        id: uuidv4(),
        name: 'New Car Down Payment',
        description: 'Saving for a down payment on a reliable family car',
        target_amount: 5000.00,
        target_date: new Date(currentDate.getFullYear(), currentDate.getMonth() + 8, 1).toISOString().split('T')[0],
        created_by: creatorProfileId,
        status: 'ACTIVE'
      },

      // Completed Goals (3)
      {
        id: uuidv4(),
        name: 'New Laptop Fund',
        description: 'Saved for a high-performance laptop for work',
        target_amount: 2500.00,
        target_date: pastDate.toISOString().split('T')[0],
        created_by: creatorProfileId,
        status: 'COMPLETED'
      },
      {
        id: uuidv4(),
        name: 'Holiday Gifts',
        description: 'Christmas and birthday gifts for family and friends',
        target_amount: 1200.00,
        target_date: new Date(currentDate.getFullYear() - 1, 11, 1).toISOString().split('T')[0],
        created_by: creatorProfileId,
        status: 'COMPLETED'
      },
      {
        id: uuidv4(),
        name: 'Furniture for New Apartment',
        description: 'Essential furniture for moving to a new place',
        target_amount: 3500.00,
        target_date: new Date(currentDate.getFullYear() - 1, currentDate.getMonth() - 6, 1).toISOString().split('T')[0],
        created_by: creatorProfileId,
        status: 'COMPLETED'
      }
    ];

    const { data, error } = await supabase
      .from('shared_goals')
      .insert(goalsData)
      .select('*');

    if (error) {
      throw new Error(`Failed to create sample shared goals: ${error.message}`);
    }

    return data;
  }

  private async createGoalParticipants(
    supabase: SupabaseClient,
    sharedGoals: any[],
    currentUserProfile: any,
    budgetId: string,
    categories: any[]
  ): Promise<void> {
    const participantsData: any[] = [];
    const savingsCategories = categories.filter(c => c.name.toLowerCase().includes('savings') ||
                                                     c.name.toLowerCase().includes('emergency') ||
                                                     c.name.toLowerCase().includes('vacation'));

    // For each goal, add the current user as the only participant
    for (const goal of sharedGoals) {
      participantsData.push({
        id: uuidv4(),
        goal_id: goal.id,
        user_profile_id: currentUserProfile.id,
        monthly_contribution: this.getRandomContribution(goal.target_amount),
        category_id: savingsCategories.length > 0 ? savingsCategories[Math.floor(Math.random() * savingsCategories.length)].id : null,
        budget_id: budgetId,
        joined_at: goal.created_at
      });
    }

    const { error } = await supabase
      .from('goal_participants')
      .insert(participantsData);

    if (error) {
      throw new Error(`Failed to create goal participants: ${error.message}`);
    }
  }





  private getRandomContribution(targetAmount: number): number {
    // Calculate a reasonable monthly contribution based on target amount
    // Aim for contributions that would reach the goal in 6-24 months
    const minMonths = 6;
    const maxMonths = 24;
    const minContribution = targetAmount / maxMonths;
    const maxContribution = targetAmount / minMonths;

    // Add some randomness
    const contribution = minContribution + Math.random() * (maxContribution - minContribution);

    // Round to nearest $10
    return Math.round(contribution / 10) * 10;
  }
}
