-- Remove currency column from portfolios (currency is tracked on transaction/stock level, not portfolio)
ALTER TABLE portfolios DROP COLUMN IF EXISTS currency;
