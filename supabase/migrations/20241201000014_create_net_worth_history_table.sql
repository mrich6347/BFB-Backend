-- Create net worth history table
-- Migration: 20241201000014_create_net_worth_history_table.sql

CREATE TABLE net_worth_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    budget_id UUID NOT NULL REFERENCES budgets(id),
    month_date DATE NOT NULL,
    total_assets NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_liabilities NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_worth NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_net_worth_per_month UNIQUE (user_id, budget_id, month_date)
);

-- Create indexes for net_worth_history
CREATE INDEX idx_net_worth_history_user_id ON net_worth_history(user_id);
CREATE INDEX idx_net_worth_history_budget_id ON net_worth_history(budget_id);
CREATE INDEX idx_net_worth_history_month_date ON net_worth_history(month_date);

-- Add updated_at trigger
CREATE TRIGGER update_net_worth_history_updated_at 
    BEFORE UPDATE ON net_worth_history 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on net_worth_history table
ALTER TABLE net_worth_history ENABLE ROW LEVEL SECURITY;

-- Net worth history policies
CREATE POLICY "Users can view their own net worth history" ON net_worth_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own net worth history" ON net_worth_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own net worth history" ON net_worth_history
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own net worth history" ON net_worth_history
    FOR DELETE USING (auth.uid() = user_id);

