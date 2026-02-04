-- DeepStock Database Schema
-- Clean, minimal portfolio tracker

-- ============================================
-- 1. PROFILES (extends Supabase auth.users)
-- ============================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    default_currency TEXT DEFAULT 'USD',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 2. PORTFOLIOS
-- ============================================
CREATE TABLE portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'My Portfolio',
    description TEXT,
    currency TEXT DEFAULT 'USD',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portfolios_user ON portfolios(user_id);

-- ============================================
-- 3. STOCKS (Master data)
-- ============================================
CREATE TABLE stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker TEXT NOT NULL UNIQUE,
    name TEXT,
    currency TEXT DEFAULT 'USD',
    exchange TEXT,
    sector TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stocks_ticker ON stocks(ticker);

-- ============================================
-- 4. TRANSACTIONS (Source of truth)
-- ============================================
CREATE TYPE transaction_type AS ENUM ('BUY', 'SELL');

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    stock_id UUID NOT NULL REFERENCES stocks(id),
    type transaction_type NOT NULL,
    shares DECIMAL(18, 8) NOT NULL,
    price_per_share DECIMAL(18, 4) NOT NULL,
    total_amount DECIMAL(18, 4) NOT NULL,
    currency TEXT DEFAULT 'USD',
    fees DECIMAL(18, 4) DEFAULT 0,
    notes TEXT,
    executed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_portfolio ON transactions(portfolio_id);
CREATE INDEX idx_transactions_stock ON transactions(stock_id);
CREATE INDEX idx_transactions_date ON transactions(executed_at DESC);

-- ============================================
-- 5. HOLDINGS (Aggregated view - computed)
-- ============================================
CREATE TABLE holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    stock_id UUID NOT NULL REFERENCES stocks(id),
    shares DECIMAL(18, 8) NOT NULL DEFAULT 0,
    avg_cost_per_share DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_cost DECIMAL(18, 4) NOT NULL DEFAULT 0,
    realized_pnl DECIMAL(18, 4) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(portfolio_id, stock_id)
);

CREATE INDEX idx_holdings_portfolio ON holdings(portfolio_id);

-- ============================================
-- 6. WATCHLISTS
-- ============================================
CREATE TABLE watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watchlists_user ON watchlists(user_id);

-- ============================================
-- 7. WATCHLIST ITEMS
-- ============================================
CREATE TABLE watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    stock_id UUID NOT NULL REFERENCES stocks(id),
    target_price DECIMAL(18, 4),
    notes TEXT,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(watchlist_id, stock_id)
);

CREATE INDEX idx_watchlist_items_watchlist ON watchlist_items(watchlist_id);

-- ============================================
-- 8. OPTION TRADES
-- ============================================
CREATE TYPE option_type AS ENUM ('CALL', 'PUT');
CREATE TYPE option_action AS ENUM ('BUY_TO_OPEN', 'SELL_TO_CLOSE', 'SELL_TO_OPEN', 'BUY_TO_CLOSE');

CREATE TABLE option_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    underlying_ticker TEXT NOT NULL,
    option_type option_type NOT NULL,
    action option_action NOT NULL,
    strike_price DECIMAL(18, 4) NOT NULL,
    expiration_date DATE NOT NULL,
    contracts INTEGER NOT NULL DEFAULT 1,
    premium_per_contract DECIMAL(18, 4) NOT NULL,
    total_premium DECIMAL(18, 4) NOT NULL,
    fees DECIMAL(18, 4) DEFAULT 0,
    notes TEXT,
    executed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_option_trades_portfolio ON option_trades(portfolio_id);
CREATE INDEX idx_option_trades_expiration ON option_trades(expiration_date);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_trades ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see their own
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Portfolios: users can CRUD their own
CREATE POLICY "Users can manage own portfolios" ON portfolios
    FOR ALL USING (auth.uid() = user_id);

-- Transactions: via portfolio ownership
CREATE POLICY "Users can manage own transactions" ON transactions
    FOR ALL USING (
        portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
    );

-- Holdings: via portfolio ownership
CREATE POLICY "Users can view own holdings" ON holdings
    FOR ALL USING (
        portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
    );

-- Watchlists: users can CRUD their own
CREATE POLICY "Users can manage own watchlists" ON watchlists
    FOR ALL USING (auth.uid() = user_id);

-- Watchlist items: via watchlist ownership
CREATE POLICY "Users can manage own watchlist items" ON watchlist_items
    FOR ALL USING (
        watchlist_id IN (SELECT id FROM watchlists WHERE user_id = auth.uid())
    );

-- Option trades: via portfolio ownership
CREATE POLICY "Users can manage own option trades" ON option_trades
    FOR ALL USING (
        portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
    );

-- Stocks: public read (no user data)
-- No RLS needed, or allow all reads
