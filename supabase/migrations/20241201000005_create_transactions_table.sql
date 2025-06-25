-- Create transactions table
-- Migration: 20241201000005_create_transactions_table.sql

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    account_id UUID NOT NULL REFERENCES accounts(id),
    category_id UUID REFERENCES categories(id),
    date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    payee TEXT,
    memo TEXT,
    is_cleared BOOLEAN NOT NULL DEFAULT false,
    is_reconciled BOOLEAN NOT NULL DEFAULT false,
    transfer_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for transactions
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_transfer_id ON transactions(transfer_id);

-- Add foreign key constraints
ALTER TABLE transactions ADD CONSTRAINT transactions_account_id_fkey 
    FOREIGN KEY (account_id) REFERENCES accounts(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_category_id_fkey 
    FOREIGN KEY (category_id) REFERENCES categories(id);

-- Add updated_at trigger
CREATE TRIGGER update_transactions_updated_at 
    BEFORE UPDATE ON transactions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
