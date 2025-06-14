// YNAB Scenario Testing Framework Types

export interface YnabScenario {
  id: string;
  name: string;
  description: string;
  setup: ScenarioSetup;
  steps: ScenarioStep[];
  expectedResults: ExpectedResults;
  tags?: string[];
  priority?: 'high' | 'medium' | 'low';
}

export interface ScenarioSetup {
  budget: BudgetSetup;
  accounts: AccountSetup[];
  categoryGroups: CategoryGroupSetup[];
  categories: CategorySetup[];
  initialTransactions?: TransactionSetup[];
}

export interface BudgetSetup {
  name: string;
  currency: string;
  currency_placement: 'before' | 'after';
  date_format: string;
  number_format: string;
}

export interface AccountSetup {
  name: string;
  type: 'cash' | 'credit' | 'tracking';
  balance: number;
  is_closed?: boolean;
}

export interface CategoryGroupSetup {
  name: string;
  is_hidden?: boolean;
  sort_order?: number;
}

export interface CategorySetup {
  name: string;
  category_group_name: string;
  assigned?: number;
  activity?: number;
  available?: number;
  is_hidden?: boolean;
  sort_order?: number;
}

export interface TransactionSetup {
  account_name: string;
  payee: string;
  category_name?: string; // Can be null for Ready to Assign
  memo?: string;
  amount: number; // Positive for inflow, negative for outflow
  date: string;
  is_cleared?: boolean;
  is_reconciled?: boolean;
}

export interface ScenarioStep {
  type: 'transaction' | 'category_assignment' | 'money_transfer' | 'account_reconcile' | 'month_rollover' | 'custom';
  description: string;
  action: StepAction;
  expectedStateChanges?: Partial<ExpectedResults>;
}

export type StepAction = 
  | TransactionAction
  | CategoryAssignmentAction
  | MoneyTransferAction
  | AccountReconcileAction
  | MonthRolloverAction
  | CustomAction;

export interface TransactionAction {
  type: 'transaction';
  account_name: string;
  payee: string;
  category_name?: string;
  memo?: string;
  amount: number;
  date: string;
  is_cleared?: boolean;
}

export interface CategoryAssignmentAction {
  type: 'category_assignment';
  category_name: string;
  amount: number; // Amount to assign (positive) or remove (negative)
  month?: string; // Default to current month
}

export interface MoneyTransferAction {
  type: 'money_transfer';
  from_category_name: string;
  to_category_name: string;
  amount: number;
  month?: string;
}

export interface AccountReconcileAction {
  type: 'account_reconcile';
  account_name: string;
  reconcile_balance: number;
}

export interface MonthRolloverAction {
  type: 'month_rollover';
  target_month: string; // YYYY-MM format
}

export interface CustomAction {
  type: 'custom';
  handler: string; // Name of custom handler function
  params: Record<string, any>;
}

export interface ExpectedResults {
  readyToAssign: number;
  accounts: ExpectedAccountState[];
  categories: ExpectedCategoryState[];
  transactions?: ExpectedTransactionState[];
}

export interface ExpectedAccountState {
  name: string;
  account_balance: number;
  cleared_balance: number;
  uncleared_balance: number;
  working_balance: number;
}

export interface ExpectedCategoryState {
  name: string;
  category_group_name: string;
  assigned: number;
  activity: number;
  available: number;
  month?: string; // Default to current month
}

export interface ExpectedTransactionState {
  account_name: string;
  payee: string;
  category_name?: string;
  amount: number;
  date: string;
  is_cleared: boolean;
  is_reconciled: boolean;
}

export interface ScenarioResult {
  scenario: YnabScenario;
  success: boolean;
  errors: TestError[];
  actualResults: ExpectedResults;
  executionTime: number;
  attempts: number;
}

export interface TestError {
  type: 'setup' | 'execution' | 'validation';
  step?: string;
  field: string;
  expected: any;
  actual: any;
  message: string;
}

export interface TestContext {
  budgetId: string;
  userId: string;
  authToken: string;
  accountMap: Map<string, string>; // name -> id
  categoryMap: Map<string, string>; // name -> id
  categoryGroupMap: Map<string, string>; // name -> id
  transactionMap: Map<string, string>; // description -> id
}

export interface ScenarioExecutorOptions {
  maxAttempts?: number;
  retryDelay?: number;
  verbose?: boolean;
  stopOnFirstError?: boolean;
  cleanupAfterTest?: boolean;
}
