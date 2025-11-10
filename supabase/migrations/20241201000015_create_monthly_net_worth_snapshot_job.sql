-- Create monthly net worth snapshot job
-- Migration: 20241201000015_create_monthly_net_worth_snapshot_job.sql

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to capture net worth snapshots for all active budgets
CREATE OR REPLACE FUNCTION capture_monthly_net_worth_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    budget_record RECORD;
    total_assets_calc NUMERIC(15,2);
    total_liabilities_calc NUMERIC(15,2);
    net_worth_calc NUMERIC(15,2);
    snapshot_date DATE;
BEGIN
    -- Set snapshot date to the first day of the current month
    -- This runs on the 1st of each month (e.g., Dec 1st) to capture the balance at that moment
    -- The balance on Dec 1st represents the end of November, so we store it as Dec 1st
    -- This matches our convention where end-of-month balance is stored as the next month's 1st
    snapshot_date := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    
    -- Loop through all active budgets
    FOR budget_record IN 
        SELECT DISTINCT b.id as budget_id, b.user_id
        FROM budgets b
        WHERE b.id IN (SELECT DISTINCT budget_id FROM accounts WHERE is_active = true)
    LOOP
        -- Calculate net worth for this budget
        SELECT 
            COALESCE(SUM(CASE 
                WHEN a.account_type IN ('CASH', 'TRACKING') 
                THEN COALESCE(a.working_balance, a.account_balance, 0)
                ELSE 0 
            END), 0),
            COALESCE(SUM(CASE 
                WHEN a.account_type = 'CREDIT' 
                THEN COALESCE(a.working_balance, a.account_balance, 0)
                ELSE 0 
            END), 0)
        INTO total_assets_calc, total_liabilities_calc
        FROM accounts a
        WHERE a.budget_id = budget_record.budget_id
          AND a.user_id = budget_record.user_id
          AND a.is_active = true;
        
        -- Calculate net worth
        net_worth_calc := total_assets_calc + total_liabilities_calc;
        
        -- Insert or update the snapshot (upsert)
        INSERT INTO net_worth_history (
            user_id,
            budget_id,
            month_date,
            total_assets,
            total_liabilities,
            net_worth
        )
        VALUES (
            budget_record.user_id,
            budget_record.budget_id,
            snapshot_date,
            total_assets_calc,
            total_liabilities_calc,
            net_worth_calc
        )
        ON CONFLICT (user_id, budget_id, month_date)
        DO UPDATE SET
            total_assets = EXCLUDED.total_assets,
            total_liabilities = EXCLUDED.total_liabilities,
            net_worth = EXCLUDED.net_worth,
            updated_at = CURRENT_TIMESTAMP;
        
        -- Log the snapshot (optional, for debugging)
        RAISE NOTICE 'Captured net worth snapshot for budget % (user %): Assets=%, Liabilities=%, Net Worth=%',
            budget_record.budget_id,
            budget_record.user_id,
            total_assets_calc,
            total_liabilities_calc,
            net_worth_calc;
    END LOOP;
    
    RAISE NOTICE 'Monthly net worth snapshot capture completed for date: %', snapshot_date;
END;
$$;

-- Grant execute permission to authenticated users (for manual testing)
GRANT EXECUTE ON FUNCTION capture_monthly_net_worth_snapshots() TO authenticated;

-- Schedule the job to run on the 1st of every month at 2:00 AM UTC
-- Note: pg_cron uses UTC timezone
SELECT cron.schedule(
    'monthly-net-worth-snapshot',           -- Job name
    '0 2 1 * *',                            -- Cron expression: At 02:00 on day-of-month 1
    $$SELECT capture_monthly_net_worth_snapshots();$$
);

-- To view scheduled jobs, run:
-- SELECT * FROM cron.job;

-- To unschedule the job (if needed), run:
-- SELECT cron.unschedule('monthly-net-worth-snapshot');

-- To manually test the function, run:
-- SELECT capture_monthly_net_worth_snapshots();

