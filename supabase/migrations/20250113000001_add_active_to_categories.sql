-- Add active column to categories table
-- Migration: 20250113000001_add_active_to_categories.sql

-- Add active column with default true
ALTER TABLE categories ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

-- Create index for active column for better query performance
CREATE INDEX idx_categories_active ON categories(active);

-- Add comment to explain the column
COMMENT ON COLUMN categories.active IS 'Indicates if the category is active (true) or hidden (false). Hidden categories retain their original category_group_id for reporting purposes.';

