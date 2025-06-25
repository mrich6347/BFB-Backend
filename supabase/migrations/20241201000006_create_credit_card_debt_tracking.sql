-- Create credit card debt tracking table
-- Migration: 20241201000006_create_credit_card_debt_tracking.sql

CREATE TABLE credit_card_debt_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    credit_card_account_id UUID NOT NULL REFERENCES accounts(id),
    original_category_id UUID REFERENCES categories(id),
    user_id UUID NOT NULL,
    budget_id UUID NOT NULL,
    debt_amount NUMERIC(15,2) NOT NULL,
    covered_amount NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for credit_card_debt_tracking
CREATE INDEX idx_cc_debt_tracking_transaction ON credit_card_debt_tracking(transaction_id);
CREATE INDEX idx_cc_debt_tracking_cc_account ON credit_card_debt_tracking(credit_card_account_id);
CREATE INDEX idx_cc_debt_tracking_user_budget ON credit_card_debt_tracking(user_id, budget_id);

-- Add foreign key constraints
ALTER TABLE credit_card_debt_tracking ADD CONSTRAINT credit_card_debt_tracking_transaction_id_fkey 
    FOREIGN KEY (transaction_id) REFERENCES transactions(id);
ALTER TABLE credit_card_debt_tracking ADD CONSTRAINT credit_card_debt_tracking_credit_card_account_id_fkey 
    FOREIGN KEY (credit_card_account_id) REFERENCES accounts(id);
ALTER TABLE credit_card_debt_tracking ADD CONSTRAINT credit_card_debt_tracking_original_category_id_fkey 
    FOREIGN KEY (original_category_id) REFERENCES categories(id);

-- Add updated_at trigger
CREATE TRIGGER update_credit_card_debt_tracking_updated_at 
    BEFORE UPDATE ON credit_card_debt_tracking 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
