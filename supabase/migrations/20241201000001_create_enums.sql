-- Create custom enum types
-- Migration: 20241201000001_create_enums.sql

-- Account type enum
CREATE TYPE account_type AS ENUM (
    'CASH',
    'LOAN', 
    'CREDIT',
    'TRACKING'
);

-- Currency placement enum
CREATE TYPE currency_placement_enum AS ENUM (
    'BEFORE',
    'AFTER',
    'NONE'
);

-- Date format enum
CREATE TYPE date_format_enum AS ENUM (
    'ISO',
    'HYPHEN',
    'EUROPEAN',
    'UK_SLASH',
    'PERIOD',
    'US_SLASH',
    'DOT_NOTATION'
);

-- Number format enum
CREATE TYPE number_format_enum AS ENUM (
    'DOT_COMMA',
    'COMMA_COMMA',
    'DOT_COMMA_THREE',
    'SPACE_DOT',
    'APOSTROPHE_DOT',
    'DOT_NO_DECIMAL',
    'COMMA_NO_DECIMAL',
    'SPACE_HYPHEN',
    'SPACE_COMMA',
    'COMMA_SLASH',
    'SPACE_NO_DECIMAL',
    'COMMA_DOT_LEADING'
);

-- Goal status enum
CREATE TYPE goal_status AS ENUM (
    'ACTIVE',
    'COMPLETED',
    'PAUSED',
    'CANCELLED'
);

-- Invitation status enum
CREATE TYPE invitation_status AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED'
);

-- Activity type enum for shared goals
CREATE TYPE activity_type AS ENUM (
    'GOAL_CREATED',
    'GOAL_UPDATED',
    'GOAL_COMPLETED',
    'GOAL_PAUSED',
    'GOAL_CANCELLED',
    'USER_JOINED',
    'USER_LEFT',
    'USER_INVITED',
    'INVITATION_ACCEPTED',
    'INVITATION_DECLINED',
    'CONTRIBUTION_UPDATED',
    'CATEGORY_CHANGED',
    'MONTHLY_CONTRIBUTION_SET',
    'PROGRESS_MILESTONE'
);
