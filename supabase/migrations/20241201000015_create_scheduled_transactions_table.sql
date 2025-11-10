-- Create scheduled transactions table
-- Migration: 20241201000015_create_scheduled_transactions_table.sql

-- Create frequency enum
CREATE TYPE scheduled_frequency AS ENUM ('MONTHLY', 'WEEKLY', 'BIWEEKLY', 'YEARLY');

CREATE TABLE scheduled_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    budget_id UUID NOT NULL REFERENCES budgets(id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    category_id UUID REFERENCES categories(id),
    payee TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    memo TEXT,
    frequency scheduled_frequency NOT NULL DEFAULT 'MONTHLY',
    day_of_month INTEGER, -- For MONTHLY and YEARLY (1-31)
    day_of_week INTEGER, -- For WEEKLY and BIWEEKLY (0=Sunday, 6=Saturday)
    month_of_year INTEGER, -- For YEARLY only (1-12)
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_created_date DATE, -- Track when we last created a transaction from this schedule
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for scheduled_transactions
CREATE INDEX idx_scheduled_transactions_user_id ON scheduled_transactions(user_id);
CREATE INDEX idx_scheduled_transactions_budget_id ON scheduled_transactions(budget_id);
CREATE INDEX idx_scheduled_transactions_account_id ON scheduled_transactions(account_id);
CREATE INDEX idx_scheduled_transactions_category_id ON scheduled_transactions(category_id);
CREATE INDEX idx_scheduled_transactions_is_active ON scheduled_transactions(is_active);

-- Add updated_at trigger
CREATE TRIGGER update_scheduled_transactions_updated_at 
    BEFORE UPDATE ON scheduled_transactions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE scheduled_transactions ENABLE ROW LEVEL SECURITY;

-- Scheduled transactions policies
CREATE POLICY "Users can view their own scheduled transactions" ON scheduled_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scheduled transactions" ON scheduled_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled transactions" ON scheduled_transactions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled transactions" ON scheduled_transactions
    FOR DELETE USING (auth.uid() = user_id);

