-- Add lot tracking for SELL transactions
-- Allows selling from specific lots instead of just FIFO

-- Add source_transaction_id to track which BUY lot a SELL is from
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS source_transaction_id UUID REFERENCES transactions(id);

-- Add exchange rate for CZK conversion
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS exchange_rate_to_czk DECIMAL(18, 6);

-- Index for faster lot lookups
CREATE INDEX IF NOT EXISTS idx_transactions_source 
ON transactions(source_transaction_id) 
WHERE source_transaction_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN transactions.source_transaction_id IS 
'For SELL: references the original BUY transaction (lot) being sold. NULL means FIFO auto-assignment.';

COMMENT ON COLUMN transactions.exchange_rate_to_czk IS 
'Exchange rate to CZK at time of transaction. Used for tax reporting in Czech Republic.';
