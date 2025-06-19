import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
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
      'categories',             // References category_groups and budgets
      'category_groups',        // References budgets
      'accounts',               // References budgets
      'budgets'                 // Parent table - delete last
    ];
  }

  private async clearTableForUser(supabase: SupabaseClient, table: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error(`Error clearing table ${table}:`, error);
        throw new Error(`Failed to clear table ${table}: ${error.message}`);
      }
    } catch (error) {
      console.error(`Error clearing table ${table}:`, error);
      throw new Error(`Failed to clear table ${table}: ${error.message}`);
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
        id: uuidv4(),
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
    const months = [];

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
          let monthlyChanges = [];

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
}
