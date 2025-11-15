-- Create retirement settings table
-- Migration: 20250115000001_create_retirement_settings_table.sql

CREATE TABLE retirement_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    monthly_contribution NUMERIC(15,2) NOT NULL DEFAULT 2000.00,
    retirement_age INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_retirement_settings_per_user_budget UNIQUE (user_id, budget_id)
);

-- Create indexes for retirement_settings
CREATE INDEX idx_retirement_settings_user_budget ON retirement_settings(user_id, budget_id);

-- Add foreign key constraint
ALTER TABLE retirement_settings ADD CONSTRAINT fk_retirement_settings_budget 
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;

-- Add updated_at trigger
CREATE TRIGGER update_retirement_settings_updated_at 
    BEFORE UPDATE ON retirement_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE retirement_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own retirement settings
CREATE POLICY "Users can view their own retirement settings"
    ON retirement_settings FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own retirement settings
CREATE POLICY "Users can insert their own retirement settings"
    ON retirement_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own retirement settings
CREATE POLICY "Users can update their own retirement settings"
    ON retirement_settings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own retirement settings
CREATE POLICY "Users can delete their own retirement settings"
    ON retirement_settings FOR DELETE
    USING (auth.uid() = user_id);

