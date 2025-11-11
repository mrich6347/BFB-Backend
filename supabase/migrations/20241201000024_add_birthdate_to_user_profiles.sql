-- Add birthdate column to user_profiles table
-- Migration: 20241201000024_add_birthdate_to_user_profiles.sql

ALTER TABLE user_profiles
ADD COLUMN birthdate DATE;

-- Add comment to explain the field
COMMENT ON COLUMN user_profiles.birthdate IS 'User birthdate for personalized statistics and age-based features';

