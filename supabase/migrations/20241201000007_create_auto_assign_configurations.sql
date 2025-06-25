-- Create auto assign configurations table
-- Migration: 20241201000007_create_auto_assign_configurations.sql

CREATE TABLE auto_assign_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    budget_id UUID NOT NULL REFERENCES budgets(id),
    user_id UUID NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id),
    amount NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT unique_category_per_config UNIQUE (name, budget_id, user_id, category_id)
);

-- Create indexes for auto_assign_configurations
CREATE INDEX idx_auto_assign_configs_user_budget ON auto_assign_configurations(user_id, budget_id);
CREATE INDEX idx_auto_assign_configs_name ON auto_assign_configurations(name, budget_id, user_id);

-- Add foreign key constraints
ALTER TABLE auto_assign_configurations ADD CONSTRAINT fk_auto_assign_budget 
    FOREIGN KEY (budget_id) REFERENCES budgets(id);
ALTER TABLE auto_assign_configurations ADD CONSTRAINT fk_auto_assign_category 
    FOREIGN KEY (category_id) REFERENCES categories(id);

-- Add updated_at trigger
CREATE TRIGGER update_auto_assign_configurations_updated_at 
    BEFORE UPDATE ON auto_assign_configurations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
