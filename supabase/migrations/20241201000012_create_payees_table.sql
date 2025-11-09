-- Create payees table
-- Migration: 20241201000012_create_payees_table.sql

CREATE TABLE payees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    budget_id UUID NOT NULL REFERENCES budgets(id),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    last_category_id UUID REFERENCES categories(id),
    last_used_at TIMESTAMPTZ,
    is_transfer BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_payee_per_budget UNIQUE (budget_id, normalized_name)
);

-- Create indexes for payees
CREATE INDEX idx_payees_user_id ON payees(user_id);
CREATE INDEX idx_payees_budget_id ON payees(budget_id);
CREATE INDEX idx_payees_normalized_name ON payees(normalized_name);
CREATE INDEX idx_payees_last_used_at ON payees(last_used_at);

-- Add updated_at trigger
CREATE TRIGGER update_payees_updated_at 
    BEFORE UPDATE ON payees 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

