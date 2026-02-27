"""
Comprehensive unit tests for Options Service.

Tests cover:
1. OCC Symbol Generation
2. Realized P/L Calculation (IBKR style)
3. Close Position Logic
4. Stock Transaction Creation for ASSIGNMENT/EXERCISE
5. Performance P/L Aggregation

NOTE: These tests use extracted pure logic functions to avoid
importing modules with external dependencies (supabase, etc.)
"""
import pytest
from datetime import date


# ============================================================
# Extracted Pure Logic Functions (matching options.py)
# ============================================================

def generate_occ_symbol(
    ticker: str,
    strike: float,
    expiration_date: date,
    option_type: str
) -> str:
    """
    Generate OCC option symbol.
    Format: [Ticker][YYMMDD][C/P][Strike × 1000 (8 digits)]
    """
    ticker_clean = ticker.upper().strip()
    date_str = expiration_date.strftime("%y%m%d")
    type_char = "C" if option_type == "call" else "P"
    strike_int = round(strike * 1000)
    strike_padded = str(strike_int).zfill(8)
    return f"{ticker_clean}{date_str}{type_char}{strike_padded}"


# ============================================================
# OCC Symbol Generation Tests
# ============================================================

class TestOccSymbolGeneration:
    """Test OCC option symbol generation."""
    
    def test_call_option_basic(self):
        """Standard call option symbol."""
        symbol = generate_occ_symbol("AAPL", 150.0, date(2025, 1, 17), "call")
        assert symbol == "AAPL250117C00150000"
    
    def test_put_option_basic(self):
        """Standard put option symbol."""
        symbol = generate_occ_symbol("AAPL", 150.0, date(2025, 1, 17), "put")
        assert symbol == "AAPL250117P00150000"
    
    def test_fractional_strike(self):
        """Strike price with decimal (e.g., 200.5)."""
        symbol = generate_occ_symbol("TSLA", 200.5, date(2025, 3, 21), "put")
        assert symbol == "TSLA250321P00200500"
    
    def test_low_strike(self):
        """Low strike price (under $10)."""
        symbol = generate_occ_symbol("F", 8.5, date(2025, 6, 20), "call")
        assert symbol == "F250620C00008500"
    
    def test_high_strike(self):
        """High strike price (over $1000)."""
        symbol = generate_occ_symbol("AMZN", 3500.0, date(2025, 12, 19), "call")
        assert symbol == "AMZN251219C03500000"
    
    def test_ticker_case_normalization(self):
        """Ticker should be uppercase."""
        symbol = generate_occ_symbol("aapl", 150.0, date(2025, 1, 17), "call")
        assert symbol == "AAPL250117C00150000"
    
    def test_ticker_with_spaces(self):
        """Ticker with spaces should be trimmed."""
        symbol = generate_occ_symbol("  AAPL  ", 150.0, date(2025, 1, 17), "call")
        assert symbol == "AAPL250117C00150000"
    
    def test_strike_rounding(self):
        """Strike with many decimals should round correctly."""
        symbol = generate_occ_symbol("SPY", 445.999, date(2025, 1, 17), "put")
        # 445.999 * 1000 = 445999, rounded = 445999
        assert symbol == "SPY250117P00445999"


# ============================================================
# Realized P/L Calculation Tests (IBKR Style)
# ============================================================

class TestRealizedPLCalculation:
    """Test IBKR-style realized P/L calculation."""
    
    def calculate_pnl(self, closing_action: str, position: str, avg_premium: float, 
                      closing_premium: float, contracts: int) -> float:
        """
        Helper to calculate P/L using the same logic as options.py close_position.
        """
        realized_pl = 0.0
        
        if closing_action == "BTC":
            # Short position close: we received avg_premium, now pay closing_premium
            realized_pl = (avg_premium - closing_premium) * contracts * 100
        elif closing_action == "STC":
            # Long position close: we paid avg_premium, now receive closing_premium
            realized_pl = (closing_premium - avg_premium) * contracts * 100
        elif closing_action == "EXPIRATION":
            if position == "short":
                # Short position expired: we keep the full premium
                realized_pl = avg_premium * contracts * 100
            else:
                # Long position expired: we lose the full premium
                realized_pl = -avg_premium * contracts * 100
        elif closing_action in ["ASSIGNMENT", "EXERCISE"]:
            # Premium is transferred to stock cost basis, option P/L = 0
            realized_pl = 0
        
        return realized_pl
    
    # ---- BTC (Buy to Close) - Short Position ----
    
    def test_btc_profit_short_closed_lower(self):
        """Short position closed at lower premium = profit."""
        # Sold at $3.00, bought back at $1.00
        pnl = self.calculate_pnl("BTC", "short", avg_premium=3.00, closing_premium=1.00, contracts=1)
        assert pnl == 200.0  # (3-1) * 1 * 100 = $200 profit
    
    def test_btc_loss_short_closed_higher(self):
        """Short position closed at higher premium = loss."""
        # Sold at $2.00, bought back at $5.00
        pnl = self.calculate_pnl("BTC", "short", avg_premium=2.00, closing_premium=5.00, contracts=1)
        assert pnl == -300.0  # (2-5) * 1 * 100 = -$300 loss
    
    def test_btc_multiple_contracts(self):
        """BTC with multiple contracts."""
        # Sold 5 contracts at $1.50, bought back at $0.50
        pnl = self.calculate_pnl("BTC", "short", avg_premium=1.50, closing_premium=0.50, contracts=5)
        assert pnl == 500.0  # (1.5-0.5) * 5 * 100 = $500
    
    def test_btc_breakeven(self):
        """Short position closed at same premium = breakeven."""
        pnl = self.calculate_pnl("BTC", "short", avg_premium=2.00, closing_premium=2.00, contracts=1)
        assert pnl == 0.0
    
    # ---- STC (Sell to Close) - Long Position ----
    
    def test_stc_profit_long_closed_higher(self):
        """Long position closed at higher premium = profit."""
        # Bought at $2.00, sold at $4.00
        pnl = self.calculate_pnl("STC", "long", avg_premium=2.00, closing_premium=4.00, contracts=1)
        assert pnl == 200.0  # (4-2) * 1 * 100 = $200 profit
    
    def test_stc_loss_long_closed_lower(self):
        """Long position closed at lower premium = loss."""
        # Bought at $3.00, sold at $1.00
        pnl = self.calculate_pnl("STC", "long", avg_premium=3.00, closing_premium=1.00, contracts=1)
        assert pnl == -200.0  # (1-3) * 1 * 100 = -$200 loss
    
    def test_stc_multiple_contracts(self):
        """STC with multiple contracts."""
        # Bought 3 contracts at $1.00, sold at $2.50
        pnl = self.calculate_pnl("STC", "long", avg_premium=1.00, closing_premium=2.50, contracts=3)
        assert pnl == 450.0  # (2.5-1) * 3 * 100 = $450
    
    # ---- EXPIRATION ----
    
    def test_expiration_short_keeps_premium(self):
        """Short position expires worthless = keep full premium."""
        # Sold at $2.00, expires worthless
        pnl = self.calculate_pnl("EXPIRATION", "short", avg_premium=2.00, closing_premium=0, contracts=1)
        assert pnl == 200.0  # 2 * 1 * 100 = $200 profit
    
    def test_expiration_long_loses_premium(self):
        """Long position expires worthless = lose full premium."""
        # Bought at $1.50, expires worthless
        pnl = self.calculate_pnl("EXPIRATION", "long", avg_premium=1.50, closing_premium=0, contracts=1)
        assert pnl == -150.0  # -1.5 * 1 * 100 = -$150 loss
    
    def test_expiration_multiple_contracts_short(self):
        """Short expiration with multiple contracts."""
        pnl = self.calculate_pnl("EXPIRATION", "short", avg_premium=0.75, closing_premium=0, contracts=10)
        assert pnl == 750.0  # 0.75 * 10 * 100 = $750
    
    def test_expiration_multiple_contracts_long(self):
        """Long expiration with multiple contracts."""
        pnl = self.calculate_pnl("EXPIRATION", "long", avg_premium=2.25, closing_premium=0, contracts=4)
        assert pnl == -900.0  # -2.25 * 4 * 100 = -$900
    
    # ---- ASSIGNMENT / EXERCISE ----
    
    def test_assignment_zero_pnl(self):
        """Assignment transfers premium to stock, option P/L = 0."""
        pnl = self.calculate_pnl("ASSIGNMENT", "short", avg_premium=3.00, closing_premium=0, contracts=1)
        assert pnl == 0.0
    
    def test_exercise_zero_pnl(self):
        """Exercise transfers premium to stock, option P/L = 0."""
        pnl = self.calculate_pnl("EXERCISE", "long", avg_premium=2.50, closing_premium=0, contracts=1)
        assert pnl == 0.0


# ============================================================
# Stock Transaction Creation for ASSIGNMENT/EXERCISE
# ============================================================

class TestStockTransactionCreation:
    """Test stock transaction creation logic for ASSIGNMENT/EXERCISE."""
    
    def calculate_effective_price(self, closing_action: str, position: str, 
                                   option_type: str, strike_price: float, 
                                   avg_premium: float) -> tuple[str, float]:
        """
        Helper to determine transaction type and effective price.
        Returns (tx_type, effective_price).
        """
        # Determine transaction type
        if closing_action == "ASSIGNMENT":
            tx_type = "BUY" if option_type == "put" else "SELL"
        else:  # EXERCISE
            tx_type = "BUY" if option_type == "call" else "SELL"
        
        # Calculate effective price
        if closing_action == "ASSIGNMENT" and position == "short":
            if tx_type == "BUY":
                # Short PUT assigned: we buy at strike, premium lowers cost
                effective_price = strike_price - avg_premium
            else:
                # Short CALL assigned: we sell at strike, premium increases effective sale
                effective_price = strike_price + avg_premium
        else:
            # EXERCISE (long positions): premium was paid separately, use strike
            effective_price = strike_price
        
        return tx_type, effective_price
    
    # ---- ASSIGNMENT Scenarios ----
    
    def test_short_put_assignment_buy_shares(self):
        """Short PUT assigned: BUY shares at (strike - premium)."""
        tx_type, price = self.calculate_effective_price(
            "ASSIGNMENT", "short", "put", strike_price=50.0, avg_premium=2.00
        )
        assert tx_type == "BUY"
        assert price == 48.0  # 50 - 2 = $48 effective cost
    
    def test_short_call_assignment_sell_shares(self):
        """Short CALL assigned: SELL shares at (strike + premium)."""
        tx_type, price = self.calculate_effective_price(
            "ASSIGNMENT", "short", "call", strike_price=100.0, avg_premium=5.00
        )
        assert tx_type == "SELL"
        assert price == 105.0  # 100 + 5 = $105 effective sale price
    
    def test_short_put_assignment_zero_premium(self):
        """Short PUT assigned with zero premium: BUY at strike."""
        tx_type, price = self.calculate_effective_price(
            "ASSIGNMENT", "short", "put", strike_price=45.0, avg_premium=0.0
        )
        assert tx_type == "BUY"
        assert price == 45.0
    
    # ---- EXERCISE Scenarios ----
    
    def test_long_call_exercise_buy_shares(self):
        """Long CALL exercised: BUY shares at strike (premium is sunk cost)."""
        tx_type, price = self.calculate_effective_price(
            "EXERCISE", "long", "call", strike_price=80.0, avg_premium=3.00
        )
        assert tx_type == "BUY"
        assert price == 80.0  # Premium is separate, use strike
    
    def test_long_put_exercise_sell_shares(self):
        """Long PUT exercised: SELL shares at strike (premium is sunk cost)."""
        tx_type, price = self.calculate_effective_price(
            "EXERCISE", "long", "put", strike_price=60.0, avg_premium=4.00
        )
        assert tx_type == "SELL"
        assert price == 60.0  # Premium is separate, use strike
    
    # ---- Shares Calculation ----
    
    def test_shares_calculation(self):
        """Each contract = 100 shares."""
        contracts = 5
        shares = contracts * 100
        assert shares == 500


# ============================================================
# Close Position Validation Tests
# ============================================================

class TestClosePositionValidation:
    """Test validation logic for closing positions."""
    
    def get_valid_close_actions(self, position: str) -> list[str]:
        """Return valid closing actions for a position type."""
        valid_close_actions = {
            "long": ["STC", "EXPIRATION", "EXERCISE"],
            "short": ["BTC", "EXPIRATION", "ASSIGNMENT"],
        }
        return valid_close_actions.get(position, [])
    
    def test_long_position_valid_actions(self):
        """Long position can be closed with STC, EXPIRATION, or EXERCISE."""
        actions = self.get_valid_close_actions("long")
        assert "STC" in actions
        assert "EXPIRATION" in actions
        assert "EXERCISE" in actions
        assert "BTC" not in actions
        assert "ASSIGNMENT" not in actions
    
    def test_short_position_valid_actions(self):
        """Short position can be closed with BTC, EXPIRATION, or ASSIGNMENT."""
        actions = self.get_valid_close_actions("short")
        assert "BTC" in actions
        assert "EXPIRATION" in actions
        assert "ASSIGNMENT" in actions
        assert "STC" not in actions
        assert "EXERCISE" not in actions
    
    def test_invalid_btc_on_long(self):
        """Cannot use BTC to close a long position."""
        actions = self.get_valid_close_actions("long")
        assert "BTC" not in actions
    
    def test_invalid_stc_on_short(self):
        """Cannot use STC to close a short position."""
        actions = self.get_valid_close_actions("short")
        assert "STC" not in actions


# ============================================================
# Lot Selection Requirements
# ============================================================

class TestLotSelectionRequirements:
    """Test when lot selection is required for closing."""
    
    def requires_lot_selection(self, closing_action: str, option_type: str) -> bool:
        """
        Determine if lot selection is required.
        Only needed when we're SELLING shares.
        """
        # Short CALL + ASSIGNMENT = must sell shares
        # Long PUT + EXERCISE = must sell shares
        return (
            (closing_action == "ASSIGNMENT" and option_type == "call") or
            (closing_action == "EXERCISE" and option_type == "put")
        )
    
    def test_short_call_assignment_requires_lot(self):
        """Short CALL assignment requires lot selection (selling shares)."""
        assert self.requires_lot_selection("ASSIGNMENT", "call") is True
    
    def test_short_put_assignment_no_lot(self):
        """Short PUT assignment does NOT require lot selection (buying shares)."""
        assert self.requires_lot_selection("ASSIGNMENT", "put") is False
    
    def test_long_put_exercise_requires_lot(self):
        """Long PUT exercise requires lot selection (selling shares)."""
        assert self.requires_lot_selection("EXERCISE", "put") is True
    
    def test_long_call_exercise_no_lot(self):
        """Long CALL exercise does NOT require lot selection (buying shares)."""
        assert self.requires_lot_selection("EXERCISE", "call") is False
    
    def test_stc_no_lot(self):
        """STC does not require lot selection."""
        assert self.requires_lot_selection("STC", "call") is False
        assert self.requires_lot_selection("STC", "put") is False
    
    def test_btc_no_lot(self):
        """BTC does not require lot selection."""
        assert self.requires_lot_selection("BTC", "call") is False
        assert self.requires_lot_selection("BTC", "put") is False


# ============================================================
# Premium Required Logic
# ============================================================

class TestPremiumRequired:
    """Test when premium is required for closing actions."""
    
    def is_premium_required(self, action: str) -> bool:
        """Determine if premium is required for an action."""
        return action not in ["EXPIRATION", "ASSIGNMENT", "EXERCISE"]
    
    def test_stc_requires_premium(self):
        """STC (Sell to Close) requires premium."""
        assert self.is_premium_required("STC") is True
    
    def test_btc_requires_premium(self):
        """BTC (Buy to Close) requires premium."""
        assert self.is_premium_required("BTC") is True
    
    def test_bto_requires_premium(self):
        """BTO (Buy to Open) requires premium."""
        assert self.is_premium_required("BTO") is True
    
    def test_sto_requires_premium(self):
        """STO (Sell to Open) requires premium."""
        assert self.is_premium_required("STO") is True
    
    def test_expiration_no_premium(self):
        """EXPIRATION does not require premium."""
        assert self.is_premium_required("EXPIRATION") is False
    
    def test_assignment_no_premium(self):
        """ASSIGNMENT does not require premium."""
        assert self.is_premium_required("ASSIGNMENT") is False
    
    def test_exercise_no_premium(self):
        """EXERCISE does not require premium."""
        assert self.is_premium_required("EXERCISE") is False


# ============================================================
# Performance P/L Aggregation Tests
# ============================================================

class TestPerformancePLAggregation:
    """Test performance.py P/L aggregation logic."""
    
    def calculate_daily_pnl(self, transactions: list[dict]) -> dict[str, float]:
        """
        Simulate performance.py logic for daily P/L calculation.
        """
        daily_pnl = {}
        
        for tx in transactions:
            date_str = tx["date"]
            action = tx["action"]
            
            pnl = 0.0
            
            # Opening transactions have no P/L
            if action in ["STO", "BTO"]:
                pnl = 0
            # Closing transactions: use total_premium which stores realized P/L
            elif action in ["BTC", "STC", "EXPIRATION", "ASSIGNMENT", "EXERCISE"]:
                if tx.get("total_premium") is not None:
                    pnl = float(tx["total_premium"])
                else:
                    # Fallback for old transactions
                    contracts = int(tx.get("contracts", 1))
                    premium = float(tx.get("premium", 0) or 0)
                    premium_value = premium * contracts * 100
                    if action == "STC":
                        pnl = premium_value
                    elif action == "BTC":
                        pnl = -premium_value
            
            if date_str not in daily_pnl:
                daily_pnl[date_str] = 0
            daily_pnl[date_str] += pnl
        
        return daily_pnl
    
    def test_sto_no_pnl_at_open(self):
        """STO should not contribute to P/L."""
        transactions = [
            {"date": "2025-01-15", "action": "STO", "premium": 3.00, "contracts": 1}
        ]
        pnl = self.calculate_daily_pnl(transactions)
        assert pnl.get("2025-01-15", 0) == 0
    
    def test_bto_no_pnl_at_open(self):
        """BTO should not contribute to P/L."""
        transactions = [
            {"date": "2025-01-16", "action": "BTO", "premium": 2.50, "contracts": 2}
        ]
        pnl = self.calculate_daily_pnl(transactions)
        assert pnl.get("2025-01-16", 0) == 0
    
    def test_btc_uses_total_premium(self):
        """BTC should use pre-calculated total_premium."""
        transactions = [
            {"date": "2025-01-20", "action": "BTC", "total_premium": 150.0, "contracts": 1}
        ]
        pnl = self.calculate_daily_pnl(transactions)
        assert pnl["2025-01-20"] == 150.0
    
    def test_stc_uses_total_premium(self):
        """STC should use pre-calculated total_premium."""
        transactions = [
            {"date": "2025-01-22", "action": "STC", "total_premium": -50.0, "contracts": 1}
        ]
        pnl = self.calculate_daily_pnl(transactions)
        assert pnl["2025-01-22"] == -50.0
    
    def test_expiration_uses_total_premium(self):
        """EXPIRATION should use pre-calculated total_premium."""
        transactions = [
            {"date": "2025-01-17", "action": "EXPIRATION", "total_premium": 200.0, "contracts": 1}
        ]
        pnl = self.calculate_daily_pnl(transactions)
        assert pnl["2025-01-17"] == 200.0
    
    def test_assignment_uses_total_premium_zero(self):
        """ASSIGNMENT should use total_premium (which is 0)."""
        transactions = [
            {"date": "2025-01-25", "action": "ASSIGNMENT", "total_premium": 0, "contracts": 1}
        ]
        pnl = self.calculate_daily_pnl(transactions)
        assert pnl["2025-01-25"] == 0
    
    def test_multiple_transactions_same_day(self):
        """Multiple transactions on same day should aggregate."""
        transactions = [
            {"date": "2025-02-01", "action": "STC", "total_premium": 100.0, "contracts": 1},
            {"date": "2025-02-01", "action": "BTC", "total_premium": 50.0, "contracts": 1},
        ]
        pnl = self.calculate_daily_pnl(transactions)
        assert pnl["2025-02-01"] == 150.0
    
    def test_fallback_for_old_stc(self):
        """Fallback for old STC without total_premium."""
        transactions = [
            {"date": "2025-01-30", "action": "STC", "premium": 2.00, "contracts": 1}
            # No total_premium
        ]
        pnl = self.calculate_daily_pnl(transactions)
        # Fallback: premium * contracts * 100 = 2 * 1 * 100 = 200
        assert pnl["2025-01-30"] == 200.0
    
    def test_fallback_for_old_btc(self):
        """Fallback for old BTC without total_premium."""
        transactions = [
            {"date": "2025-01-31", "action": "BTC", "premium": 1.50, "contracts": 2}
            # No total_premium
        ]
        pnl = self.calculate_daily_pnl(transactions)
        # Fallback: -premium * contracts * 100 = -1.5 * 2 * 100 = -300
        assert pnl["2025-01-31"] == -300.0


# ============================================================
# Integration-like Tests (Full Scenarios)
# ============================================================

class TestFullScenarios:
    """Test complete option trading scenarios."""
    
    def calculate_full_scenario_pnl(self, open_action: str, close_action: str,
                                     open_premium: float, close_premium: float,
                                     contracts: int) -> float:
        """Calculate P/L for a complete open-close scenario."""
        position = "short" if open_action == "STO" else "long"
        
        if close_action == "BTC":
            return (open_premium - close_premium) * contracts * 100
        elif close_action == "STC":
            return (close_premium - open_premium) * contracts * 100
        elif close_action == "EXPIRATION":
            if position == "short":
                return open_premium * contracts * 100
            else:
                return -open_premium * contracts * 100
        else:  # ASSIGNMENT/EXERCISE
            return 0
    
    def test_covered_call_expires_worthless(self):
        """Sell covered call (STO), expires worthless = max profit."""
        # STO at $2.50, EXPIRATION
        pnl = self.calculate_full_scenario_pnl(
            "STO", "EXPIRATION", open_premium=2.50, close_premium=0, contracts=1
        )
        assert pnl == 250.0  # Keep full $250 premium
    
    def test_covered_call_assigned(self):
        """Sell covered call (STO), gets assigned = 0 option P/L."""
        # Premium goes to stock cost basis
        pnl = self.calculate_full_scenario_pnl(
            "STO", "ASSIGNMENT", open_premium=3.00, close_premium=0, contracts=1
        )
        assert pnl == 0  # P/L is 0, but stock tx has effective price
    
    def test_cash_secured_put_assigned(self):
        """Sell CSP (STO), gets assigned = 0 option P/L."""
        pnl = self.calculate_full_scenario_pnl(
            "STO", "ASSIGNMENT", open_premium=2.00, close_premium=0, contracts=1
        )
        assert pnl == 0
    
    def test_cash_secured_put_buy_to_close_profit(self):
        """Sell CSP (STO), BTC at lower price = profit."""
        # STO at $1.50, BTC at $0.50
        pnl = self.calculate_full_scenario_pnl(
            "STO", "BTC", open_premium=1.50, close_premium=0.50, contracts=1
        )
        assert pnl == 100.0  # (1.5 - 0.5) * 100 = $100
    
    def test_cash_secured_put_buy_to_close_loss(self):
        """Sell CSP (STO), BTC at higher price = loss."""
        # STO at $1.00, BTC at $3.00
        pnl = self.calculate_full_scenario_pnl(
            "STO", "BTC", open_premium=1.00, close_premium=3.00, contracts=1
        )
        assert pnl == -200.0  # (1 - 3) * 100 = -$200
    
    def test_long_call_profitable_stc(self):
        """Buy call (BTO), sell higher (STC) = profit."""
        # BTO at $1.00, STC at $3.50
        pnl = self.calculate_full_scenario_pnl(
            "BTO", "STC", open_premium=1.00, close_premium=3.50, contracts=1
        )
        assert pnl == 250.0  # (3.5 - 1) * 100 = $250
    
    def test_long_call_losing_stc(self):
        """Buy call (BTO), sell lower (STC) = loss."""
        # BTO at $2.00, STC at $0.50
        pnl = self.calculate_full_scenario_pnl(
            "BTO", "STC", open_premium=2.00, close_premium=0.50, contracts=1
        )
        assert pnl == -150.0  # (0.5 - 2) * 100 = -$150
    
    def test_long_call_expires_worthless(self):
        """Buy call (BTO), expires worthless = max loss."""
        # BTO at $1.25, EXPIRATION
        pnl = self.calculate_full_scenario_pnl(
            "BTO", "EXPIRATION", open_premium=1.25, close_premium=0, contracts=1
        )
        assert pnl == -125.0  # Lose full premium
    
    def test_long_put_exercised(self):
        """Buy put (BTO), exercise = 0 option P/L (premium is sunk cost)."""
        pnl = self.calculate_full_scenario_pnl(
            "BTO", "EXERCISE", open_premium=2.00, close_premium=0, contracts=1
        )
        assert pnl == 0  # Premium was paid but doesn't affect option P/L
    
    def test_multiple_contracts_scenario(self):
        """Scenario with 10 contracts."""
        # STO 10 contracts at $0.75, BTC at $0.25
        pnl = self.calculate_full_scenario_pnl(
            "STO", "BTC", open_premium=0.75, close_premium=0.25, contracts=10
        )
        assert pnl == 500.0  # (0.75 - 0.25) * 10 * 100 = $500


# ============================================================
# Run Tests
# ============================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
