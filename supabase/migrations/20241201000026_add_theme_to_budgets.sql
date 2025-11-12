-- Add theme enum and column to budgets table
-- Migration: 20241201000026_add_theme_to_budgets.sql

-- Create theme enum
CREATE TYPE theme_enum AS ENUM (
    'LIGHT',
    'DARK'
);

-- Add theme column to budgets table with default value of 'DARK'
ALTER TABLE budgets
ADD COLUMN theme theme_enum NOT NULL DEFAULT 'DARK';

