-- Create category-related tables: category_groups, categories, category_balances
-- Migration: 20241201000004_create_category_tables.sql

-- Category groups table
CREATE TABLE category_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    budget_id UUID NOT NULL REFERENCES budgets(id),
    user_id UUID NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_system_group BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for category_groups
CREATE INDEX idx_category_groups_budget_id ON category_groups(budget_id);
CREATE INDEX idx_category_groups_user_id ON category_groups(user_id);

-- Categories table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    category_group_id UUID NOT NULL REFERENCES category_groups(id),
    budget_id UUID NOT NULL REFERENCES budgets(id),
    user_id UUID NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for categories
CREATE INDEX idx_categories_budget_id ON categories(budget_id);
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_categories_category_group_id ON categories(category_group_id);

-- Category balances table
CREATE TABLE category_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES categories(id),
    budget_id UUID NOT NULL REFERENCES budgets(id),
    user_id UUID NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    assigned NUMERIC(12,2) NOT NULL DEFAULT 0,
    activity NUMERIC(12,2) NOT NULL DEFAULT 0,
    available NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT category_balances_category_id_year_month_key UNIQUE (category_id, year, month)
);

-- Create indexes for category_balances
CREATE INDEX idx_category_balances_budget_id ON category_balances(budget_id);
CREATE INDEX idx_category_balances_user_id ON category_balances(user_id);
CREATE INDEX idx_category_balances_category_id ON category_balances(category_id);
CREATE INDEX idx_category_balances_year_month ON category_balances(year, month);

-- Add updated_at triggers
CREATE TRIGGER update_category_groups_updated_at 
    BEFORE UPDATE ON category_groups 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at 
    BEFORE UPDATE ON categories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_category_balances_updated_at 
    BEFORE UPDATE ON category_balances 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
