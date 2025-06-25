-- Create accounts table
-- Migration: 20241201000003_create_accounts_table.sql

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    budget_id UUID REFERENCES budgets(id),
    name TEXT NOT NULL,
    account_type account_type NOT NULL,
    cleared_balance NUMERIC NOT NULL DEFAULT 0,
    uncleared_balance NUMERIC NOT NULL DEFAULT 0,
    working_balance NUMERIC NOT NULL DEFAULT 0,
    account_balance NUMERIC(10,2) DEFAULT 0.00,
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_user_id_name UNIQUE (user_id, name, budget_id)
);

-- Create indexes for accounts
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_budget_id ON accounts(budget_id);

-- Add foreign key constraints
ALTER TABLE accounts ADD CONSTRAINT accounts_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE accounts ADD CONSTRAINT accounts_budget_id_fkey 
    FOREIGN KEY (budget_id) REFERENCES budgets(id);

-- Add updated_at trigger
CREATE TRIGGER update_accounts_updated_at 
    BEFORE UPDATE ON accounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
