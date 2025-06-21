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

    // Delete data from each table for the current user
    for (const table of tables) {
      await this.clearTableForUser(supabase, table, userId);
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

  private async createSampleAccounts(supabase: SupabaseClient, userId: string, budgetId: string): Promise<any[]> {
    const accountsData = [
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Checking Account',
        account_type: 'CASH',
        account_balance: 5000,
        cleared_balance: 5000,
        uncleared_balance: 0,
        working_balance: 5000,
        is_active: true,
        display_order: 1
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Savings Account',
        account_type: 'CASH',
        account_balance: 15000,
        cleared_balance: 15000,
        uncleared_balance: 0,
        working_balance: 15000,
        is_active: true,
        display_order: 2
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Investment Portfolio',
        account_type: 'TRACKING',
        account_balance: 25000,
        cleared_balance: 25000,
        uncleared_balance: 0,
        working_balance: 25000,
        is_active: true,
        display_order: 3
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Car Value',
        account_type: 'TRACKING',
        account_balance: 18000,
        cleared_balance: 18000,
        uncleared_balance: 0,
        working_balance: 18000,
        is_active: true,
        display_order: 4
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
    // Create category groups
    const categoryGroupsData = [
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Monthly Bills',
        display_order: 1,
        is_system_group: false
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Everyday Expenses',
        display_order: 2,
        is_system_group: false
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Savings Goals',
        display_order: 3,
        is_system_group: false
      },
      {
        id: uuidv4(),
        user_id: userId,
        budget_id: budgetId,
        name: 'Fun Money',
        display_order: 4,
        is_system_group: false
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
    const monthlyBillsGroup = categoryGroups.find(g => g.name === 'Monthly Bills');
    const everydayGroup = categoryGroups.find(g => g.name === 'Everyday Expenses');
    const savingsGroup = categoryGroups.find(g => g.name === 'Savings Goals');
    const funGroup = categoryGroups.find(g => g.name === 'Fun Money');

    const categoriesData = [
      // Monthly Bills
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyBillsGroup.id, name: 'Rent/Mortgage', display_order: 1 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyBillsGroup.id, name: 'Electric', display_order: 2 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyBillsGroup.id, name: 'Water', display_order: 3 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyBillsGroup.id, name: 'Internet', display_order: 4 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyBillsGroup.id, name: 'Phone', display_order: 5 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: monthlyBillsGroup.id, name: 'Insurance', display_order: 6 },

      // Everyday Expenses
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: everydayGroup.id, name: 'Groceries', display_order: 1 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: everydayGroup.id, name: 'Gas', display_order: 2 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: everydayGroup.id, name: 'Restaurants', display_order: 3 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: everydayGroup.id, name: 'Clothing', display_order: 4 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: everydayGroup.id, name: 'Personal Care', display_order: 5 },

      // Savings Goals
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: savingsGroup.id, name: 'Emergency Fund', display_order: 1 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: savingsGroup.id, name: 'Vacation', display_order: 2 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: savingsGroup.id, name: 'Car Replacement', display_order: 3 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: savingsGroup.id, name: 'Home Improvement', display_order: 4 },

      // Fun Money
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: funGroup.id, name: 'Entertainment', display_order: 1 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: funGroup.id, name: 'Hobbies', display_order: 2 },
      { id: uuidv4(), user_id: userId, budget_id: budgetId, category_group_id: funGroup.id, name: 'Subscriptions', display_order: 3 }
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
    // Create data for the last 6 months
    const currentDate = new Date();
    const months: Array<{ year: number; month: number; date: Date }> = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      months.push({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        date: date
      });
    }

    // Get cash accounts for transactions
    const cashAccounts = accounts.filter(a => a.account_type === 'CASH');
    const checkingAccount = cashAccounts.find(a => a.name === 'Checking Account');
    const savingsAccount = cashAccounts.find(a => a.name === 'Savings Account');

    // Create transactions and balances for each month
    for (const monthData of months) {
      await this.createMonthData(supabase, userId, budgetId, monthData, checkingAccount, savingsAccount, categories);
    }

    // Update tracking accounts with some historical changes
    await this.updateTrackingAccounts(supabase, userId, accounts.filter(a => a.account_type === 'TRACKING'));
  }

  private async createMonthData(supabase: SupabaseClient, userId: string, budgetId: string, monthData: any, checkingAccount: any, savingsAccount: any, categories: any[]): Promise<void> {
    const { year, month } = monthData;

    // Create category balances for this month
    const categoryBalances: any[] = [];
    const transactions: any[] = [];

    // Sample assignments and spending patterns
    const monthlyAssignments = {
      'Rent/Mortgage': 1200,
      'Electric': 120,
      'Water': 60,
      'Internet': 80,
      'Phone': 100,
      'Insurance': 200,
      'Groceries': 400,
      'Gas': 150,
      'Restaurants': 200,
      'Clothing': 100,
      'Personal Care': 50,
      'Emergency Fund': 500,
      'Vacation': 200,
      'Car Replacement': 300,
      'Home Improvement': 150,
      'Entertainment': 150,
      'Hobbies': 100,
      'Subscriptions': 50
    };

    // Create category balances and some transactions
    for (const category of categories) {
      const assigned = monthlyAssignments[category.name] || 0;

      // Vary assignments slightly for realism
      const variation = Math.random() * 0.2 - 0.1; // ±10%
      const finalAssigned = Math.round(assigned * (1 + variation));

      // Create some spending (70-90% of assigned amount for most categories)
      let activity = 0;
      if (finalAssigned > 0 && Math.random() > 0.1) { // 90% chance of spending
        const spendingRate = 0.7 + Math.random() * 0.2; // 70-90%
        activity = -Math.round(finalAssigned * spendingRate);

        // Create a transaction for this spending
        if (activity < 0) {
          transactions.push({
            id: uuidv4(),
            user_id: userId,
            account_id: checkingAccount.id,
            date: `${year}-${month.toString().padStart(2, '0')}-${Math.floor(Math.random() * 28) + 1}`,
            amount: activity,
            payee: this.getRandomPayee(category.name),
            memo: `${category.name} expense`,
            category_id: category.id,
            is_cleared: true,
            is_reconciled: false
          });
        }
      }

      const available = finalAssigned + activity;

      categoryBalances.push({
        category_id: category.id,
        budget_id: budgetId,
        user_id: userId,
        year: year,
        month: month,
        assigned: finalAssigned,
        activity: activity,
        available: available
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

    // Insert transactions
    if (transactions.length > 0) {
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert(transactions);

      if (transactionError) {
        throw new Error(`Failed to create transactions for ${year}-${month}: ${transactionError.message}`);
      }
    }
  }

  private getRandomPayee(categoryName: string): string {
    const payeeMap: { [key: string]: string[] } = {
      'Rent/Mortgage': ['Property Management Co', 'Landlord', 'Mortgage Company'],
      'Electric': ['Electric Company', 'Power Corp', 'Energy Provider'],
      'Water': ['Water Department', 'City Water', 'Water Utility'],
      'Internet': ['Internet Provider', 'Cable Company', 'ISP'],
      'Phone': ['Phone Company', 'Mobile Carrier', 'Telecom'],
      'Insurance': ['Insurance Company', 'Auto Insurance', 'Health Insurance'],
      'Groceries': ['Grocery Store', 'Supermarket', 'Food Market', 'Walmart', 'Target'],
      'Gas': ['Gas Station', 'Shell', 'Exxon', 'BP'],
      'Restaurants': ['Restaurant', 'Fast Food', 'Cafe', 'Pizza Place', 'Diner'],
      'Clothing': ['Clothing Store', 'Department Store', 'Online Retailer'],
      'Personal Care': ['Pharmacy', 'Salon', 'Barber Shop', 'Health Store'],
      'Entertainment': ['Movie Theater', 'Concert Venue', 'Streaming Service'],
      'Hobbies': ['Hobby Shop', 'Sports Store', 'Craft Store'],
      'Subscriptions': ['Netflix', 'Spotify', 'Amazon Prime', 'Gym Membership']
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
      if (account.name === 'Investment Portfolio') {
        // Create realistic investment portfolio changes with market volatility
        let runningBalance = 25000; // Starting balance

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
      } else if (account.name === 'Car Value') {
        // Create realistic car depreciation with some maintenance/improvements
        let carValue = 18000; // Starting value

        for (let i = 0; i < months.length; i++) {
          const monthData = months[i];
          const dateStr = `${monthData.year}-${monthData.month.toString().padStart(2, '0')}`;

          // Regular monthly depreciation (varies by season and mileage)
          let monthlyDepreciation = -Math.floor(Math.random() * 200) - 300; // $300-500 per month

          // Seasonal adjustments
          if (monthData.month >= 11 || monthData.month <= 2) {
            // Winter months - higher depreciation due to weather
            monthlyDepreciation -= Math.floor(Math.random() * 100) + 50;
          }

          transactions.push({
            id: uuidv4(),
            user_id: userId,
            account_id: account.id,
            date: `${dateStr}-${(Math.floor(Math.random() * 28) + 1).toString().padStart(2, '0')}`,
            amount: monthlyDepreciation,
            payee: 'Depreciation',
            memo: 'Monthly depreciation',
            category_id: null,
            is_cleared: true,
            is_reconciled: false
          });

          // Occasional maintenance that adds value
          if (Math.random() < 0.15) { // 15% chance per month
            const maintenanceValue = Math.floor(Math.random() * 800) + 200;
            transactions.push({
              id: uuidv4(),
              user_id: userId,
              account_id: account.id,
              date: `${dateStr}-${(Math.floor(Math.random() * 28) + 1).toString().padStart(2, '0')}`,
              amount: maintenanceValue,
              payee: 'Auto Shop',
              memo: 'Maintenance/Repairs',
              category_id: null,
              is_cleared: true,
              is_reconciled: false
            });
          }

          // Major service or upgrade occasionally
          if (Math.random() < 0.05) { // 5% chance per month
            const upgradeValue = Math.floor(Math.random() * 1500) + 500;
            transactions.push({
              id: uuidv4(),
              user_id: userId,
              account_id: account.id,
              date: `${dateStr}-${(Math.floor(Math.random() * 28) + 1).toString().padStart(2, '0')}`,
              amount: upgradeValue,
              payee: 'Auto Dealer',
              memo: 'Major service/upgrade',
              category_id: null,
              is_cleared: true,
              is_reconciled: false
            });
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
    // Create 5 different auto-assign configurations with various combinations of categories
    const configurations = [
      {
        name: 'Monthly Essentials',
        items: [
          { category_name: 'Rent/Mortgage', amount: 1200 },
          { category_name: 'Electric', amount: 120 },
          { category_name: 'Water', amount: 60 },
          { category_name: 'Internet', amount: 80 },
          { category_name: 'Phone', amount: 100 }
        ]
      },
      {
        name: 'Food & Transportation',
        items: [
          { category_name: 'Groceries', amount: 400 },
          { category_name: 'Gas', amount: 150 },
          { category_name: 'Restaurants', amount: 200 }
        ]
      },
      {
        name: 'Savings Goals',
        items: [
          { category_name: 'Emergency Fund', amount: 500 },
          { category_name: 'Vacation', amount: 200 },
          { category_name: 'Car Replacement', amount: 300 }
        ]
      },
      {
        name: 'Personal Care & Fun',
        items: [
          { category_name: 'Personal Care', amount: 50 },
          { category_name: 'Entertainment', amount: 150 },
          { category_name: 'Hobbies', amount: 100 },
          { category_name: 'Subscriptions', amount: 50 }
        ]
      },
      {
        name: 'Insurance & Protection',
        items: [
          { category_name: 'Insurance', amount: 200 },
          { category_name: 'Emergency Fund', amount: 300 },
          { category_name: 'Home Improvement', amount: 150 }
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

    // Create shared goals (6 active, 4 completed) - all owned by current user
    const sharedGoals = await this.createSampleSharedGoals(supabase, currentUserProfile.id);

    // Add the current user as participant to all goals
    await this.createGoalParticipants(supabase, sharedGoals, currentUserProfile, budgetId, categories);

    // Create category balances for completed goals to ensure they show as completed
    await this.createCompletedGoalBalances(supabase, sharedGoals, budgetId);
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
      // Active Goals (6)
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
      {
        id: uuidv4(),
        name: 'Home Renovation',
        description: 'Kitchen and bathroom renovation project',
        target_amount: 25000.00,
        target_date: new Date(currentDate.getFullYear() + 1, currentDate.getMonth() + 6, 1).toISOString().split('T')[0],
        created_by: creatorProfileId,
        status: 'ACTIVE'
      },
      {
        id: uuidv4(),
        name: 'Kids College Fund',
        description: 'Long-term savings for children\'s education expenses',
        target_amount: 50000.00,
        target_date: null,
        created_by: creatorProfileId,
        status: 'ACTIVE'
      },
      {
        id: uuidv4(),
        name: 'Wedding Expenses',
        description: 'Saving for wedding venue, catering, and other expenses',
        target_amount: 12000.00,
        target_date: new Date(currentDate.getFullYear() + 1, currentDate.getMonth() + 3, 15).toISOString().split('T')[0],
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



  private async createCompletedGoalBalances(supabase: SupabaseClient, sharedGoals: any[], budgetId: string): Promise<void> {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Find completed goals and their participants
    const completedGoals = sharedGoals.filter(goal => goal.status === 'COMPLETED');

    for (const goal of completedGoals) {
      // Get the participant for this goal
      const { data: participants, error: participantError } = await supabase
        .from('goal_participants')
        .select('category_id')
        .eq('goal_id', goal.id);

      if (participantError || !participants || participants.length === 0) {
        continue;
      }

      const participant = participants[0];
      if (!participant.category_id) {
        continue;
      }

      // Check if category balance already exists for current month
      const { data: existingBalance } = await supabase
        .from('category_balances')
        .select('id')
        .eq('category_id', participant.category_id)
        .eq('budget_id', budgetId)
        .eq('year', currentYear)
        .eq('month', currentMonth)
        .single();

      if (existingBalance) {
        // Update existing balance to have enough for the goal
        await supabase
          .from('category_balances')
          .update({
            available: goal.target_amount,
            assigned: goal.target_amount
          })
          .eq('id', existingBalance.id);
      } else {
        // Create new balance with enough for the goal
        await supabase
          .from('category_balances')
          .insert([{
            id: uuidv4(),
            category_id: participant.category_id,
            budget_id: budgetId,
            year: currentYear,
            month: currentMonth,
            assigned: goal.target_amount,
            activity: 0,
            available: goal.target_amount
          }]);
      }
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
