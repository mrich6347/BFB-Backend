-- Create shared goals related tables
-- Migration: 20241201000008_create_shared_goals_tables.sql

-- Shared goals table
CREATE TABLE shared_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    target_amount NUMERIC(12,2) NOT NULL,
    target_date DATE,
    created_by UUID NOT NULL REFERENCES user_profiles(id),
    status goal_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for shared_goals
CREATE INDEX shared_goals_created_by_idx ON shared_goals(created_by);
CREATE INDEX shared_goals_status_idx ON shared_goals(status);
CREATE INDEX shared_goals_target_date_idx ON shared_goals(target_date);

-- Goal invitations table
CREATE TABLE goal_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES shared_goals(id),
    inviter_id UUID NOT NULL REFERENCES user_profiles(id),
    invitee_username VARCHAR(50) NOT NULL,
    invitee_id UUID REFERENCES user_profiles(id),
    status invitation_status NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_goal_invitation UNIQUE (goal_id, invitee_username)
);

-- Create indexes for goal_invitations
CREATE INDEX goal_invitations_goal_id_idx ON goal_invitations(goal_id);
CREATE INDEX goal_invitations_inviter_id_idx ON goal_invitations(inviter_id);
CREATE INDEX goal_invitations_invitee_id_idx ON goal_invitations(invitee_id);
CREATE INDEX goal_invitations_invitee_username_idx ON goal_invitations(invitee_username);
CREATE INDEX goal_invitations_status_idx ON goal_invitations(status);
CREATE INDEX goal_invitations_expires_at_idx ON goal_invitations(expires_at);

-- Goal participants table
CREATE TABLE goal_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES shared_goals(id),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id),
    monthly_contribution NUMERIC(10,2),
    category_id UUID,
    budget_id UUID NOT NULL,
    joined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_goal_participant UNIQUE (goal_id, user_profile_id)
);

-- Create indexes for goal_participants
CREATE INDEX goal_participants_goal_id_idx ON goal_participants(goal_id);
CREATE INDEX goal_participants_user_profile_id_idx ON goal_participants(user_profile_id);
CREATE INDEX goal_participants_category_id_idx ON goal_participants(category_id);
CREATE INDEX goal_participants_budget_id_idx ON goal_participants(budget_id);

-- Add updated_at triggers
CREATE TRIGGER update_shared_goals_updated_at 
    BEFORE UPDATE ON shared_goals 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_goal_invitations_updated_at 
    BEFORE UPDATE ON goal_invitations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_goal_participants_updated_at 
    BEFORE UPDATE ON goal_participants 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
