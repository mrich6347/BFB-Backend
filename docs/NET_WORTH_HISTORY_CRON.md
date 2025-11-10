# Net Worth History - Automated Monthly Snapshots

## Overview

The BFB application automatically captures monthly net worth snapshots for all active budgets using PostgreSQL's `pg_cron` extension. This ensures historical net worth data is preserved even if users don't log in regularly.

## How It Works

### 1. Database Function: `capture_monthly_net_worth_snapshots()`

This PostgreSQL function:
- Runs automatically on the 1st of each month at 2:00 AM UTC
- Captures the net worth for ALL active budgets in the system
- Calculates:
  - **Total Assets**: Sum of all CASH and TRACKING account balances
  - **Total Liabilities**: Sum of all CREDIT account balances (negative values)
  - **Net Worth**: Assets + Liabilities
- Stores the snapshot with the date set to the **first day of the previous month**
  - Example: Job runs on Dec 1st → captures balance → stores as "2024-11-01" (November)
  - This represents November's ending balance
- Uses UPSERT logic to prevent duplicates

### 2. Cron Schedule

- **Schedule**: `0 2 1 * *` (2:00 AM UTC on the 1st of every month)
- **Timezone**: UTC (Supabase pg_cron uses UTC)
- **Job Name**: `monthly-net-worth-snapshot`

## Verifying the Cron Job

### Check if the job is scheduled

Run this query in the Supabase SQL Editor:

```sql
SELECT * FROM cron.job;
```

You should see a job named `monthly-net-worth-snapshot`.

### View job execution history

```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'monthly-net-worth-snapshot')
ORDER BY start_time DESC
LIMIT 10;
```

### Manually trigger the snapshot (for testing)

```sql
SELECT capture_monthly_net_worth_snapshots();
```

This will immediately capture snapshots for all budgets.

### View captured snapshots

```sql
SELECT 
    nwh.*,
    b.name as budget_name
FROM net_worth_history nwh
JOIN budgets b ON b.id = nwh.budget_id
ORDER BY nwh.month_date DESC, b.name;
```

## Troubleshooting

### Job not running?

1. **Check if pg_cron is enabled**:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. **Check for errors in job runs**:
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE status = 'failed'
   ORDER BY start_time DESC;
   ```

3. **Verify the function exists**:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'capture_monthly_net_worth_snapshots';
   ```

### Reschedule the job

If you need to change the schedule:

```sql
-- Unschedule the existing job
SELECT cron.unschedule('monthly-net-worth-snapshot');

-- Schedule with new timing (example: 3:00 AM instead of 2:00 AM)
SELECT cron.schedule(
    'monthly-net-worth-snapshot',
    '0 3 1 * *',
    $$SELECT capture_monthly_net_worth_snapshots();$$
);
```

## Manual Snapshot via API

Users can also manually trigger a snapshot via the API endpoint:

```
POST /net-worth-history/snapshot
{
  "budget_id": "uuid-here",
  "month_date": "2025-01-01"  // Optional, defaults to current month
}
```

## Important Notes

1. **Timezone**: The cron job runs in UTC. Adjust the schedule if you need it to run at a specific local time.

2. **Date Storage Convention**:
   - YNAB's "Oct 2024" represents the balance at the **end** of October
   - We store this as "2024-11-01" (first day of November)
   - **Cron job behavior**: Runs on Dec 1st → captures balance → stores as "2024-12-01"
   - This means the Dec 1st snapshot represents the end-of-November balance
   - Example timeline:
     - Nov 30th 11:59 PM: User makes final November transaction
     - Dec 1st 2:00 AM UTC: Cron runs, captures balance, stores as "2024-12-01"
     - This "2024-12-01" snapshot represents November's ending balance

4. **Upsert Behavior**: If a snapshot already exists for a given month, it will be updated with the latest values.

5. **Performance**: The function processes all budgets in a single transaction. For large numbers of users, consider batching or optimization.

6. **Supabase Limitations**:
   - Free tier: pg_cron is available but may have limitations
   - Paid tier: Full pg_cron support
   - Check your Supabase plan for specific limits

## Migration Files

- `20241201000014_create_net_worth_history_table.sql` - Creates the table
- `20241201000015_create_monthly_net_worth_snapshot_job.sql` - Creates the function and cron job

## Future Enhancements

Potential improvements:
- Add email notifications when snapshots are captured
- Create a dashboard to monitor cron job health
- Add retry logic for failed snapshots
- Support for custom snapshot frequencies (weekly, quarterly)

