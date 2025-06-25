-- Add Row Level Security policies for shared goals
-- Migration: 20241201000010_add_shared_goals_rls.sql

-- Shared goals policies
CREATE POLICY "Users can view shared goals they created or participate in" ON shared_goals
    FOR SELECT USING (
        created_by IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        OR id IN (
            SELECT goal_id FROM goal_participants 
            WHERE user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Users can insert their own shared goals" ON shared_goals
    FOR INSERT WITH CHECK (
        created_by IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can update shared goals they created" ON shared_goals
    FOR UPDATE USING (
        created_by IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can delete shared goals they created" ON shared_goals
    FOR DELETE USING (
        created_by IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    );

-- Goal invitations policies
CREATE POLICY "Users can view invitations they sent or received" ON goal_invitations
    FOR SELECT USING (
        inviter_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        OR invitee_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        OR invitee_username IN (SELECT username FROM user_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert invitations for their own goals" ON goal_invitations
    FOR INSERT WITH CHECK (
        inviter_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can update invitations they sent or received" ON goal_invitations
    FOR UPDATE USING (
        inviter_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        OR invitee_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can delete invitations they sent" ON goal_invitations
    FOR DELETE USING (
        inviter_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    );

-- Goal participants policies
CREATE POLICY "Users can view participants in goals they're involved with" ON goal_participants
    FOR SELECT USING (
        goal_id IN (
            SELECT id FROM shared_goals 
            WHERE created_by IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        )
        OR user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        OR goal_id IN (
            SELECT goal_id FROM goal_participants 
            WHERE user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Users can insert their own participation" ON goal_participants
    FOR INSERT WITH CHECK (
        user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can update their own participation" ON goal_participants
    FOR UPDATE USING (
        user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can delete their own participation" ON goal_participants
    FOR DELETE USING (
        user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    );
