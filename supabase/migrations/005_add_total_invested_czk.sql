-- Add total_invested_czk to holdings for proper P/L calculation
-- This stores the invested amount in CZK using historical exchange rates

ALTER TABLE holdings 
ADD COLUMN IF NOT EXISTS total_invested_czk DECIMAL(18, 4);

COMMENT ON COLUMN holdings.total_invested_czk IS 
    'Total invested in CZK using historical exchange rates from transactions';

-- Add total_amount_czk to transactions (calculated from exchange_rate_to_czk)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS total_amount_czk DECIMAL(18, 4);

COMMENT ON COLUMN transactions.total_amount_czk IS 
    'Total amount in CZK = total_amount * exchange_rate_to_czk';

-- Create trigger to auto-calculate total_amount_czk on transaction insert/update
CREATE OR REPLACE FUNCTION calculate_transaction_czk()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_amount_czk := NEW.total_amount * COALESCE(NEW.exchange_rate_to_czk, 1);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_transaction_czk_trigger ON transactions;
CREATE TRIGGER calculate_transaction_czk_trigger
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_transaction_czk();

-- Update existing transactions to calculate total_amount_czk
UPDATE transactions 
SET total_amount_czk = total_amount * COALESCE(exchange_rate_to_czk, 1)
WHERE total_amount_czk IS NULL;
