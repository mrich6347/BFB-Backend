-- Update scheduled transactions cron job to run at better time
-- Migration: 20241201000017_update_scheduled_transactions_cron_time.sql

-- Unschedule the old cron job
SELECT cron.unschedule('process-scheduled-transactions');

-- Schedule the cron job to run daily at 12 PM UTC (noon)
-- This translates to early morning for US timezones:
-- - Pacific: 4-5 AM
-- - Mountain: 5-6 AM
-- - Central: 6-7 AM
-- - Eastern: 7-8 AM
SELECT cron.schedule(
    'process-scheduled-transactions',
    '0 12 * * *', -- Every day at 12:00 PM UTC
    'SELECT process_scheduled_transactions();'
);

