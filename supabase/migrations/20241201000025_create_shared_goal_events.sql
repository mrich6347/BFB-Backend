-- Create shared_goal_events table and trigger
-- Migration: 20241201000025_create_shared_goal_events.sql

-- Create event type enum
CREATE TYPE goal_event_type AS ENUM ('assigned', 'unassigned');

-- Create shared_goal_events table
CREATE TABLE shared_goal_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES shared_goals(id) ON DELETE CASCADE,
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount_change NUMERIC(12,2) NOT NULL,
    event_type goal_event_type NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for shared_goal_events
CREATE INDEX shared_goal_events_goal_id_idx ON shared_goal_events(goal_id);
CREATE INDEX shared_goal_events_created_at_idx ON shared_goal_events(created_at DESC);
CREATE INDEX shared_goal_events_goal_created_idx ON shared_goal_events(goal_id, created_at DESC);

-- Function to track shared goal category balance changes
CREATE OR REPLACE FUNCTION track_shared_goal_events()
RETURNS TRIGGER AS $$
DECLARE
    goal_participant RECORD;
    amount_diff NUMERIC(12,2);
    event_type_val goal_event_type;
BEGIN
    -- Only process if assigned amount changed
    IF OLD.assigned IS DISTINCT FROM NEW.assigned THEN
        amount_diff := NEW.assigned - OLD.assigned;
        
        -- Skip if change is negligible (less than 1 cent)
        IF ABS(amount_diff) < 0.01 THEN
            RETURN NEW;
        END IF;
        
        -- Check if this category is linked to any active shared goals
        FOR goal_participant IN
            SELECT 
                gp.goal_id,
                gp.user_profile_id,
                gp.category_id,
                sg.status
            FROM goal_participants gp
            JOIN shared_goals sg ON sg.id = gp.goal_id
            WHERE gp.category_id = NEW.category_id
                AND sg.status = 'ACTIVE'
        LOOP
            -- Determine event type based on whether amount increased or decreased
            IF amount_diff > 0 THEN
                event_type_val := 'assigned';
            ELSE
                event_type_val := 'unassigned';
                -- Make amount positive for storage
                amount_diff := ABS(amount_diff);
            END IF;
            
            -- Create event record
            INSERT INTO shared_goal_events (
                goal_id,
                user_profile_id,
                category_id,
                amount_change,
                event_type,
                created_at
            ) VALUES (
                goal_participant.goal_id,
                goal_participant.user_profile_id,
                goal_participant.category_id,
                amount_diff,
                event_type_val,
                NOW()
            );
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on category_balances
CREATE TRIGGER track_shared_goal_events_trigger
    AFTER UPDATE ON category_balances
    FOR EACH ROW
    EXECUTE FUNCTION track_shared_goal_events();

-- Add RLS policies for shared_goal_events
ALTER TABLE shared_goal_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view events for goals they participate in or created
CREATE POLICY "Users can view events for their shared goals"
    ON shared_goal_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM shared_goals sg
            LEFT JOIN goal_participants gp ON gp.goal_id = sg.id
            WHERE sg.id = shared_goal_events.goal_id
                AND (
                    sg.created_by = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
                    OR gp.user_profile_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
                )
        )
    );

-- Policy: System can insert events (trigger-based)
CREATE POLICY "System can insert goal events"
    ON shared_goal_events
    FOR INSERT
    WITH CHECK (true);

