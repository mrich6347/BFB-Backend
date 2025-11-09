-- Add Row Level Security for payees table
-- Migration: 20241201000013_add_payees_rls.sql

-- Enable RLS on payees table
ALTER TABLE payees ENABLE ROW LEVEL SECURITY;

-- Payees policies
CREATE POLICY "Users can view their own payees" ON payees
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payees" ON payees
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own payees" ON payees
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own payees" ON payees
    FOR DELETE USING (auth.uid() = user_id);

