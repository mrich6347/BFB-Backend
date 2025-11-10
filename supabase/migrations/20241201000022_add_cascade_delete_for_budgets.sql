-- Add CASCADE DELETE for budget-related tables
-- Migration: 20241201000022_add_cascade_delete_for_budgets.sql
-- This ensures that when a budget is deleted, all related data is automatically removed

-- Drop existing foreign key constraints and recreate with CASCADE DELETE

-- Accounts table
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_budget_id_fkey;
ALTER TABLE accounts ADD CONSTRAINT accounts_budget_id_fkey
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;

-- Category groups table
ALTER TABLE category_groups DROP CONSTRAINT IF EXISTS category_groups_budget_id_fkey;
ALTER TABLE category_groups ADD CONSTRAINT category_groups_budget_id_fkey
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;

-- Categories table
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_budget_id_fkey;
ALTER TABLE categories ADD CONSTRAINT categories_budget_id_fkey
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;

-- Category balances table
ALTER TABLE category_balances DROP CONSTRAINT IF EXISTS category_balances_budget_id_fkey;
ALTER TABLE category_balances ADD CONSTRAINT category_balances_budget_id_fkey
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;

-- Auto assign configurations table
ALTER TABLE auto_assign_configurations DROP CONSTRAINT IF EXISTS fk_auto_assign_budget;
ALTER TABLE auto_assign_configurations ADD CONSTRAINT fk_auto_assign_budget
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;

-- Goal participants table (has budget_id)
ALTER TABLE goal_participants DROP CONSTRAINT IF EXISTS goal_participants_budget_id_fkey;
ALTER TABLE goal_participants ADD CONSTRAINT goal_participants_budget_id_fkey
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;

-- Payees table
ALTER TABLE payees DROP CONSTRAINT IF EXISTS payees_budget_id_fkey;
ALTER TABLE payees ADD CONSTRAINT payees_budget_id_fkey
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;

-- Net worth history table
ALTER TABLE net_worth_history DROP CONSTRAINT IF EXISTS net_worth_history_budget_id_fkey;
ALTER TABLE net_worth_history ADD CONSTRAINT net_worth_history_budget_id_fkey
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;

-- Scheduled transactions table
ALTER TABLE scheduled_transactions DROP CONSTRAINT IF EXISTS scheduled_transactions_budget_id_fkey;
ALTER TABLE scheduled_transactions ADD CONSTRAINT scheduled_transactions_budget_id_fkey
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;

-- Note: Transactions will be deleted via CASCADE from accounts
-- Note: Shared goals don't have budget_id, they're linked via goal_participants

