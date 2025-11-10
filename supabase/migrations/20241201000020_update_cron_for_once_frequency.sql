-- Update cron job to handle ONCE frequency
-- Migration: 20241201000020_update_cron_for_once_frequency.sql

-- Update the process_scheduled_transactions function to handle ONCE frequency
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
            WHEN 'ONCE' THEN
                -- Create if today is the specific date and we haven't created it yet
                IF transaction_date = scheduled_rec.specific_date AND
                   scheduled_rec.last_created_date IS NULL
                THEN
                    should_create := true;
                END IF;
                
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
            
            -- For ONCE frequency, deactivate after creating
            IF scheduled_rec.frequency = 'ONCE' THEN
                UPDATE scheduled_transactions
                SET is_active = false
                WHERE id = scheduled_rec.id;
                
                RAISE NOTICE 'Created one-time scheduled transaction for payee: % and deactivated it', scheduled_rec.payee;
            ELSE
                RAISE NOTICE 'Created scheduled transaction for payee: %', scheduled_rec.payee;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

