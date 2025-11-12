import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import type {
  CategorySpendingResponse,
  SpendingOverTimeResponse,
  TopPayeesResponse,
  CategoryBreakdownResponse,
  IncomeVsExpensesResponse,
  ReportsQueryDto
} from './dto/reports.dto';

@Injectable()
export class ReportsService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get top spending categories for a given period
   */
  async getTopSpendingCategories(
    query: ReportsQueryDto,
    userId: string,
    authToken: string
  ): Promise<CategorySpendingResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    const { start_date, end_date } = this.getDateRange(query);
    const limit = query.limit || 10;

    // First get all account IDs for this budget
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id')
      .eq('budget_id', query.budget_id)
      .eq('user_id', userId);

    if (accountsError) {
      throw new Error(accountsError.message);
    }

    const accountIds = accounts?.map(a => a.id) || [];
    if (accountIds.length === 0) {
      return {
        period_start: start_date,
        period_end: end_date,
        categories: []
      };
    }

    // Query transactions with category information
    // Only include outflows (negative amounts)
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        amount,
        category_id,
        categories (
          id,
          name,
          category_groups (
            name
          )
        )
      `)
      .eq('user_id', userId)
      .in('account_id', accountIds)
      .gte('date', start_date)
      .lte('date', end_date)
      .lt('amount', 0) // Only expenses (negative amounts)
      .not('category_id', 'is', null); // Exclude uncategorized

    if (error) {
      throw new Error(error.message);
    }

    // Filter out credit card payment categories (any category ending with "Payment")
    const filteredTransactions = transactions?.filter(t => {
      const categoryName = (t.categories as any)?.name || '';
      return !categoryName.endsWith(' Payment');
    }) || [];

    // Aggregate by category
    const categoryMap = new Map<string, {
      category_id: string;
      category_name: string;
      category_group_name: string;
      total_spent: number;
      transaction_count: number;
    }>();

    filteredTransactions.forEach((txn: any) => {
      if (!txn.categories) return;

      const categoryId = txn.category_id;
      const categoryName = txn.categories.name;
      const categoryGroupName = txn.categories.category_groups?.name || 'Uncategorized';
      const amount = Math.abs(txn.amount);

      if (categoryMap.has(categoryId)) {
        const existing = categoryMap.get(categoryId)!;
        existing.total_spent += amount;
        existing.transaction_count += 1;
      } else {
        categoryMap.set(categoryId, {
          category_id: categoryId,
          category_name: categoryName,
          category_group_name: categoryGroupName,
          total_spent: amount,
          transaction_count: 1
        });
      }
    });

    // Sort by total spent and take top N
    const categories = Array.from(categoryMap.values())
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, limit);

    return {
      period_start: start_date,
      period_end: end_date,
      categories
    };
  }

  /**
   * Get spending over time (monthly breakdown)
   */
  async getSpendingOverTime(
    query: ReportsQueryDto,
    userId: string,
    authToken: string
  ): Promise<SpendingOverTimeResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    const { start_date, end_date } = this.getDateRange(query);

    // First get all account IDs for this budget
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id')
      .eq('budget_id', query.budget_id)
      .eq('user_id', userId);

    if (accountsError) {
      throw new Error(accountsError.message);
    }

    const accountIds = accounts?.map(a => a.id) || [];
    if (accountIds.length === 0) {
      return { months: [] };
    }

    // Get all transactions in the date range
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('date, amount')
      .eq('user_id', userId)
      .in('account_id', accountIds)
      .gte('date', start_date)
      .lte('date', end_date)
      .order('date', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    // Group by month
    const monthMap = new Map<string, {
      year: number;
      month: number;
      total_income: number;
      total_expenses: number;
    }>();

    transactions?.forEach((txn: any) => {
      const date = new Date(txn.date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // 1-12
      const key = `${year}-${month}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, {
          year,
          month,
          total_income: 0,
          total_expenses: 0
        });
      }

      const monthData = monthMap.get(key)!;
      if (txn.amount > 0) {
        monthData.total_income += txn.amount;
      } else {
        monthData.total_expenses += Math.abs(txn.amount);
      }
    });

    // Convert to array and sort by date
    const months = Array.from(monthMap.values())
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      })
      .map(m => ({
        ...m,
        month_label: this.getMonthLabel(m.year, m.month),
        net: m.total_income - m.total_expenses
      }));

    return { months };
  }

  /**
   * Get top payees by spending
   */
  async getTopPayees(
    query: ReportsQueryDto,
    userId: string,
    authToken: string
  ): Promise<TopPayeesResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    const { start_date, end_date } = this.getDateRange(query);
    const limit = query.limit || 10;

    // First get all account IDs for this budget
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id')
      .eq('budget_id', query.budget_id)
      .eq('user_id', userId);

    if (accountsError) {
      throw new Error(accountsError.message);
    }

    const accountIds = accounts?.map(a => a.id) || [];
    if (accountIds.length === 0) {
      return {
        period_start: start_date,
        period_end: end_date,
        payees: []
      };
    }

    // Query transactions with payee information
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('amount, payee')
      .eq('user_id', userId)
      .in('account_id', accountIds)
      .gte('date', start_date)
      .lte('date', end_date)
      .lt('amount', 0) // Only expenses
      .not('payee', 'is', null);

    if (error) {
      throw new Error(error.message);
    }

    // Aggregate by payee
    const payeeMap = new Map<string, {
      payee: string;
      total_spent: number;
      transaction_count: number;
    }>();

    transactions?.forEach((txn: any) => {
      const payee = txn.payee;
      const amount = Math.abs(txn.amount);

      if (payeeMap.has(payee)) {
        const existing = payeeMap.get(payee)!;
        existing.total_spent += amount;
        existing.transaction_count += 1;
      } else {
        payeeMap.set(payee, {
          payee,
          total_spent: amount,
          transaction_count: 1
        });
      }
    });

    // Sort by total spent and take top N
    const payees = Array.from(payeeMap.values())
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, limit);

    return {
      period_start: start_date,
      period_end: end_date,
      payees
    };
  }

  /**
   * Get category breakdown (for pie chart)
   */
  async getCategoryBreakdown(
    query: ReportsQueryDto,
    userId: string,
    authToken: string
  ): Promise<CategoryBreakdownResponse> {
    const supabase = this.supabaseService.getAuthenticatedClient(authToken);
    const { start_date, end_date } = this.getDateRange(query);

    const topCategories = await this.getTopSpendingCategories(
      { ...query, limit: 100 }, // Get all categories
      userId,
      authToken
    );

    const total_expenses = topCategories.categories.reduce(
      (sum, cat) => sum + cat.total_spent,
      0
    );

    const breakdown = topCategories.categories.map(cat => ({
      category_id: cat.category_id,
      category_name: cat.category_name,
      category_group_name: cat.category_group_name,
      amount: cat.total_spent,
      percentage: total_expenses > 0 ? (cat.total_spent / total_expenses) * 100 : 0
    }));

    // Get largest transaction
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('budget_id', query.budget_id)
      .eq('user_id', userId);

    const accountIds = accounts?.map(a => a.id) || [];

    let largest_transaction: {
      amount: number;
      category_name: string;
      payee: string;
      date: string;
    } | undefined = undefined;

    if (accountIds.length > 0) {
      const { data: transactions, error: txnError } = await supabase
        .from('transactions')
        .select(`
          amount,
          payee,
          date,
          categories (
            name
          )
        `)
        .eq('user_id', userId)
        .in('account_id', accountIds)
        .gte('date', start_date)
        .lte('date', end_date)
        .lt('amount', 0)
        .not('category_id', 'is', null)
        .order('amount', { ascending: true })
        .limit(10);

      console.log('🔍 Largest transaction query:', {
        accountIds,
        start_date,
        end_date,
        transactionCount: transactions?.length,
        error: txnError,
        transactions: transactions?.map(t => ({
          amount: t.amount,
          payee: t.payee,
          category: (t.categories as any)?.name
        }))
      });

      if (transactions && transactions.length > 0) {
        // Filter out payment categories and find the largest
        const validTransactions = transactions.filter(txn => {
          const categoryName = (txn.categories as any)?.name || '';
          return !categoryName.endsWith(' Payment');
        });

        if (validTransactions.length > 0) {
          const txn = validTransactions[0];
          largest_transaction = {
            amount: Math.abs(txn.amount),
            category_name: (txn.categories as any)?.name || 'Unknown',
            payee: txn.payee || 'Unknown',
            date: txn.date
          };
        }
      }
    }

    return {
      period_start: topCategories.period_start,
      period_end: topCategories.period_end,
      total_expenses,
      breakdown,
      largest_transaction
    };
  }

  /**
   * Helper to get date range from query
   */
  private getDateRange(query: ReportsQueryDto): { start_date: string; end_date: string } {
    if (query.start_date && query.end_date) {
      return {
        start_date: query.start_date,
        end_date: query.end_date
      };
    }

    // Default to last N months
    const months = query.months || 6;
    const end_date = new Date();
    const start_date = new Date();
    start_date.setMonth(start_date.getMonth() - months);

    return {
      start_date: start_date.toISOString().split('T')[0],
      end_date: end_date.toISOString().split('T')[0]
    };
  }

  /**
   * Helper to format month label
   */
  private getMonthLabel(year: number, month: number): string {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[month - 1]} ${year}`;
  }
}

