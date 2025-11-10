-- Enable Realtime for all tables that need cross-device synchronization
-- This allows the frontend to subscribe to database changes in real-time

-- Enable realtime on core tables
ALTER PUBLICATION supabase_realtime ADD TABLE budgets;
ALTER PUBLICATION supabase_realtime ADD TABLE accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE category_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE category_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE scheduled_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE shared_goals;
ALTER PUBLICATION supabase_realtime ADD TABLE payees;
ALTER PUBLICATION supabase_realtime ADD TABLE auto_assign_configurations;
ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;

