"""OCC option symbol generation. Option accounting and writes are tested in test_options_accounting.py and test_option_writes.py."""
import pytest
from datetime import date

from app.services.options import generate_occ_symbol

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
