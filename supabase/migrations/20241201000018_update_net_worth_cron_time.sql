-- Update net worth snapshot cron job to run at better time
-- Migration: 20241201000018_update_net_worth_cron_time.sql

-- Unschedule the old cron job
SELECT cron.unschedule('monthly-net-worth-snapshot');

-- Schedule the cron job to run on the 1st of every month at 12 PM UTC (noon)
-- This translates to early morning for US timezones:
-- - Pacific: 4-5 AM
-- - Mountain: 5-6 AM
-- - Central: 6-7 AM
-- - Eastern: 7-8 AM
SELECT cron.schedule(
    'monthly-net-worth-snapshot',
    '0 12 1 * *', -- At 12:00 PM UTC on day-of-month 1
    $$SELECT capture_monthly_net_worth_snapshots();$$
);

