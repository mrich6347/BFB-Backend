-- Add note column to net_worth_history table
-- Migration: 20241201000023_add_note_to_net_worth_history.sql

-- Add note column to allow users to annotate specific data points
ALTER TABLE net_worth_history
ADD COLUMN note TEXT;

-- Add comment explaining the new column
COMMENT ON COLUMN net_worth_history.note IS 'User-provided note to explain changes in net worth at this point in time';

