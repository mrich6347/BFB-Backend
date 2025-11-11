-- Create function to get the most recent update timestamp for a budget
-- This is used to detect if data has changed while the app was in the background
-- Migration: 20241201000025_create_last_update_function.sql

CREATE OR REPLACE FUNCTION get_budget_last_update(p_budget_id UUID, p_user_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    last_update TIMESTAMPTZ;
BEGIN
    -- Get the maximum updated_at timestamp across all budget-related tables
    SELECT GREATEST(
        COALESCE((SELECT MAX(updated_at) FROM budgets WHERE id = p_budget_id AND user_id = p_user_id), '1970-01-01'::TIMESTAMPTZ),
        COALESCE((SELECT MAX(updated_at) FROM accounts WHERE budget_id = p_budget_id AND user_id = p_user_id), '1970-01-01'::TIMESTAMPTZ),
        COALESCE((SELECT MAX(updated_at) FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE budget_id = p_budget_id AND user_id = p_user_id)), '1970-01-01'::TIMESTAMPTZ),
        COALESCE((SELECT MAX(updated_at) FROM categories WHERE budget_id = p_budget_id AND user_id = p_user_id), '1970-01-01'::TIMESTAMPTZ),
        COALESCE((SELECT MAX(updated_at) FROM category_groups WHERE budget_id = p_budget_id AND user_id = p_user_id), '1970-01-01'::TIMESTAMPTZ),
        COALESCE((SELECT MAX(updated_at) FROM category_balances WHERE budget_id = p_budget_id AND user_id = p_user_id), '1970-01-01'::TIMESTAMPTZ),
        COALESCE((SELECT MAX(updated_at) FROM scheduled_transactions WHERE budget_id = p_budget_id AND user_id = p_user_id), '1970-01-01'::TIMESTAMPTZ),
        COALESCE((SELECT MAX(updated_at) FROM payees WHERE budget_id = p_budget_id AND user_id = p_user_id), '1970-01-01'::TIMESTAMPTZ),
        COALESCE((SELECT MAX(updated_at) FROM shared_goals WHERE budget_id = p_budget_id), '1970-01-01'::TIMESTAMPTZ)
    ) INTO last_update;

    RETURN last_update;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_budget_last_update(UUID, UUID) TO authenticated;

