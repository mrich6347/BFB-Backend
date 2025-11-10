-- Add ONCE frequency to scheduled_frequency enum
-- Migration: 20241201000019_add_once_frequency.sql

-- Add ONCE to the scheduled_frequency enum
ALTER TYPE scheduled_frequency ADD VALUE 'ONCE';

-- Add a specific_date column for ONCE frequency
ALTER TABLE scheduled_transactions
ADD COLUMN specific_date DATE;

-- Add comment explaining the new column
COMMENT ON COLUMN scheduled_transactions.specific_date IS 'Used only for ONCE frequency - the specific date when the transaction should be created';

