-- Create triggers and functions for automatic category creation and management
-- Migration: 20241201000011_create_triggers_and_functions.sql

-- Function to create default categories when a budget is created
CREATE OR REPLACE FUNCTION create_default_categories()
RETURNS TRIGGER AS $$
DECLARE
  group_id UUID;
  current_year INTEGER;
  current_month INTEGER;
  cat_id UUID;
BEGIN
  -- Get current date components
  current_year := EXTRACT(YEAR FROM NOW());
  current_month := EXTRACT(MONTH FROM NOW());

  -- Create "Monthly Bills" group
  INSERT INTO category_groups (name, budget_id, user_id, display_order)
  VALUES ('Monthly Bills', NEW.id, NEW.user_id, 1)
  RETURNING id INTO group_id;
  
  -- Create categories in "Monthly Bills" group one by one
  INSERT INTO categories (name, category_group_id, budget_id, user_id, display_order)
  VALUES ('Rent/Mortgage', group_id, NEW.id, NEW.user_id, 1)
  RETURNING id INTO cat_id;
  
  -- Create balance for Rent/Mortgage (current month only)
  INSERT INTO category_balances (category_id, budget_id, user_id, year, month, assigned, activity, available)
  VALUES (cat_id, NEW.id, NEW.user_id, current_year, current_month, 0, 0, 0);

  INSERT INTO categories (name, category_group_id, budget_id, user_id, display_order)
  VALUES ('Phone', group_id, NEW.id, NEW.user_id, 2)
  RETURNING id INTO cat_id;
  
  -- Create balance for Phone (current month only)
  INSERT INTO category_balances (category_id, budget_id, user_id, year, month, assigned, activity, available)
  VALUES (cat_id, NEW.id, NEW.user_id, current_year, current_month, 0, 0, 0);

  INSERT INTO categories (name, category_group_id, budget_id, user_id, display_order)
  VALUES ('Internet', group_id, NEW.id, NEW.user_id, 3)
  RETURNING id INTO cat_id;
  
  -- Create balance for Internet (current month only)
  INSERT INTO category_balances (category_id, budget_id, user_id, year, month, assigned, activity, available)
  VALUES (cat_id, NEW.id, NEW.user_id, current_year, current_month, 0, 0, 0);

  INSERT INTO categories (name, category_group_id, budget_id, user_id, display_order)
  VALUES ('Utilities', group_id, NEW.id, NEW.user_id, 4)
  RETURNING id INTO cat_id;
  
  -- Create balance for Utilities (current month only)
  INSERT INTO category_balances (category_id, budget_id, user_id, year, month, assigned, activity, available)
  VALUES (cat_id, NEW.id, NEW.user_id, current_year, current_month, 0, 0, 0);

  -- Create "Everyday Expenses" group
  INSERT INTO category_groups (name, budget_id, user_id, display_order)
  VALUES ('Everyday Expenses', NEW.id, NEW.user_id, 2)
  RETURNING id INTO group_id;
  
  -- Create categories in "Everyday Expenses" group one by one
  INSERT INTO categories (name, category_group_id, budget_id, user_id, display_order)
  VALUES ('Groceries', group_id, NEW.id, NEW.user_id, 1)
  RETURNING id INTO cat_id;
  
  -- Create balance for Groceries (current month only)
  INSERT INTO category_balances (category_id, budget_id, user_id, year, month, assigned, activity, available)
  VALUES (cat_id, NEW.id, NEW.user_id, current_year, current_month, 0, 0, 0);

  INSERT INTO categories (name, category_group_id, budget_id, user_id, display_order)
  VALUES ('Dining Out', group_id, NEW.id, NEW.user_id, 2)
  RETURNING id INTO cat_id;
  
  -- Create balance for Dining Out (current month only)
  INSERT INTO category_balances (category_id, budget_id, user_id, year, month, assigned, activity, available)
  VALUES (cat_id, NEW.id, NEW.user_id, current_year, current_month, 0, 0, 0);

  INSERT INTO categories (name, category_group_id, budget_id, user_id, display_order)
  VALUES ('Transportation', group_id, NEW.id, NEW.user_id, 3)
  RETURNING id INTO cat_id;
  
  -- Create balance for Transportation (current month only)
  INSERT INTO category_balances (category_id, budget_id, user_id, year, month, assigned, activity, available)
  VALUES (cat_id, NEW.id, NEW.user_id, current_year, current_month, 0, 0, 0);

  -- Create "Savings Goals" group
  INSERT INTO category_groups (name, budget_id, user_id, display_order)
  VALUES ('Savings Goals', NEW.id, NEW.user_id, 3)
  RETURNING id INTO group_id;
  
  -- Create categories in "Savings Goals" group one by one
  INSERT INTO categories (name, category_group_id, budget_id, user_id, display_order)
  VALUES ('Emergency Fund', group_id, NEW.id, NEW.user_id, 1)
  RETURNING id INTO cat_id;
  
  -- Create balance for Emergency Fund (current month only)
  INSERT INTO category_balances (category_id, budget_id, user_id, year, month, assigned, activity, available)
  VALUES (cat_id, NEW.id, NEW.user_id, current_year, current_month, 0, 0, 0);

  INSERT INTO categories (name, category_group_id, budget_id, user_id, display_order)
  VALUES ('Vacation', group_id, NEW.id, NEW.user_id, 2)
  RETURNING id INTO cat_id;
  
  -- Create balance for Vacation (current month only)
  INSERT INTO category_balances (category_id, budget_id, user_id, year, month, assigned, activity, available)
  VALUES (cat_id, NEW.id, NEW.user_id, current_year, current_month, 0, 0, 0);

  -- Create "Credit Card Payments" group (always created but will be hidden if no credit cards)
  -- Mark it as a system group to prevent editing
  INSERT INTO category_groups (name, budget_id, user_id, display_order, is_system_group)
  VALUES ('Credit Card Payments', NEW.id, NEW.user_id, 999, TRUE)
  RETURNING id INTO group_id;

  -- Create "Hidden Categories" group (system group for hidden categories)
  -- Mark it as a system group to prevent editing and set high display order to appear last
  INSERT INTO category_groups (name, budget_id, user_id, display_order, is_system_group)
  VALUES ('Hidden Categories', NEW.id, NEW.user_id, 1000, TRUE)
  RETURNING id INTO group_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create default categories when a budget is inserted
CREATE TRIGGER create_default_categories_trigger
    AFTER INSERT ON budgets
    FOR EACH ROW
    EXECUTE FUNCTION create_default_categories();