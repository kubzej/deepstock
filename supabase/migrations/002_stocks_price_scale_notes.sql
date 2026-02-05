-- Add price_scale, notes and country columns to stocks table
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS price_scale DECIMAL(10, 6) DEFAULT 1;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS country TEXT;

-- Add comment explaining price_scale
COMMENT ON COLUMN stocks.price_scale IS 'Ratio to convert quoted price to actual share price. 1 = normal, 0.01 = price per 100 shares (LSE)';
