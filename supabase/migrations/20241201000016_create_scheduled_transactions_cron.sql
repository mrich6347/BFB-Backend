-- Create cron job for scheduled transactions
-- Migration: 20241201000016_create_scheduled_transactions_cron.sql

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to process scheduled transactions
CREATE OR REPLACE FUNCTION process_scheduled_transactions()
RETURNS void AS $$
DECLARE
    scheduled_rec RECORD;
    should_create BOOLEAN;
    transaction_date DATE;
BEGIN
    -- Get current date
    transaction_date := CURRENT_DATE;
    
    -- Loop through all active scheduled transactions
    FOR scheduled_rec IN 
        SELECT * FROM scheduled_transactions 
        WHERE is_active = true
    LOOP
        should_create := false;
        
        -- Check if we should create a transaction based on frequency
        CASE scheduled_rec.frequency
            WHEN 'MONTHLY' THEN
                -- Create if today is the day of month and we haven't created one this month
                IF EXTRACT(DAY FROM transaction_date) = scheduled_rec.day_of_month AND
                   (scheduled_rec.last_created_date IS NULL OR 
                    EXTRACT(MONTH FROM scheduled_rec.last_created_date) != EXTRACT(MONTH FROM transaction_date) OR
                    EXTRACT(YEAR FROM scheduled_rec.last_created_date) != EXTRACT(YEAR FROM transaction_date))
                THEN
                    should_create := true;
                END IF;
                
            WHEN 'WEEKLY' THEN
                -- Create if today is the day of week and we haven't created one this week
                IF EXTRACT(DOW FROM transaction_date) = scheduled_rec.day_of_week AND
                   (scheduled_rec.last_created_date IS NULL OR 
                    transaction_date - scheduled_rec.last_created_date >= 7)
                THEN
                    should_create := true;
                END IF;
                
            WHEN 'BIWEEKLY' THEN
                -- Create if today is the day of week and we haven't created one in the last 14 days
                IF EXTRACT(DOW FROM transaction_date) = scheduled_rec.day_of_week AND
                   (scheduled_rec.last_created_date IS NULL OR 
                    transaction_date - scheduled_rec.last_created_date >= 14)
                THEN
                    should_create := true;
                END IF;
                
            WHEN 'YEARLY' THEN
                -- Create if today is the day and month and we haven't created one this year
                IF EXTRACT(DAY FROM transaction_date) = scheduled_rec.day_of_month AND
                   EXTRACT(MONTH FROM transaction_date) = scheduled_rec.month_of_year AND
                   (scheduled_rec.last_created_date IS NULL OR 
                    EXTRACT(YEAR FROM scheduled_rec.last_created_date) != EXTRACT(YEAR FROM transaction_date))
                THEN
                    should_create := true;
                END IF;
        END CASE;
        
        -- Create the transaction if conditions are met
        IF should_create THEN
            INSERT INTO transactions (
                user_id,
                account_id,
                category_id,
                date,
                amount,
                payee,
                memo,
                is_cleared,
                is_reconciled
            ) VALUES (
                scheduled_rec.user_id,
                scheduled_rec.account_id,
                scheduled_rec.category_id,
                transaction_date,
                scheduled_rec.amount,
                scheduled_rec.payee,
                COALESCE(scheduled_rec.memo, 'Scheduled transaction'),
                false, -- Not cleared by default
                false  -- Not reconciled by default
            );
            
            -- Update last_created_date
            UPDATE scheduled_transactions
            SET last_created_date = transaction_date
            WHERE id = scheduled_rec.id;
            
            RAISE NOTICE 'Created scheduled transaction for payee: %', scheduled_rec.payee;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule the cron job to run daily at 2 AM UTC
-- Note: pg_cron uses UTC time
SELECT cron.schedule(
    'process-scheduled-transactions',
    '0 2 * * *', -- Every day at 2 AM UTC
    'SELECT process_scheduled_transactions();'
);

