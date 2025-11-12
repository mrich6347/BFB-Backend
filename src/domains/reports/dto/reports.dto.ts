export interface CategorySpendingItem {
  category_id: string;
  category_name: string;
  category_group_name: string;
  total_spent: number;
  transaction_count: number;
}

export interface CategorySpendingResponse {
  period_start: string;
  period_end: string;
  categories: CategorySpendingItem[];
}

export interface CategoryGroupSpendingItem {
  category_group_id: string;
  category_group_name: string;
  total_spent: number;
  transaction_count: number;
  category_count: number;
}

export interface CategoryGroupSpendingResponse {
  period_start: string;
  period_end: string;
  category_groups: CategoryGroupSpendingItem[];
}

export interface MonthlySpendingItem {
  year: number;
  month: number;
  month_label: string; // e.g., "Jan 2024"
  total_income: number;
  total_expenses: number;
  net: number;
}

export interface SpendingOverTimeResponse {
  months: MonthlySpendingItem[];
}

export interface PayeeSpendingItem {
  payee: string;
  total_spent: number;
  transaction_count: number;
}

export interface TopPayeesResponse {
  period_start: string;
  period_end: string;
  payees: PayeeSpendingItem[];
}

export interface CategoryBreakdownItem {
  category_id: string;
  category_name: string;
  category_group_name: string;
  amount: number;
  percentage: number;
}

export interface CategoryBreakdownResponse {
  period_start: string;
  period_end: string;
  total_expenses: number;
  breakdown: CategoryBreakdownItem[];
  largest_transaction?: {
    amount: number;
    category_name: string;
    payee: string;
    date: string;
  };
}

export interface IncomeVsExpensesItem {
  month_label: string;
  income: number;
  expenses: number;
}

export interface IncomeVsExpensesResponse {
  months: IncomeVsExpensesItem[];
}

export interface ReportsQueryDto {
  budget_id: string;
  start_date?: string; // ISO date string
  end_date?: string; // ISO date string
  months?: number; // Number of months to look back (default: 6)
  limit?: number; // For top N queries (default: 10)
}

