import yfinance as yf
import json
import math
import logging
from typing import Dict
from app.core.config import get_settings
from app.core.redis import get_redis
from app.core.cache import CacheTTL

logger = logging.getLogger(__name__)

class ExchangeRateService:
    """Service for fetching and caching exchange rates to CZK."""
    
    # Primary currency pairs (direct to CZK)
    DIRECT_PAIRS = {
        'USD': 'USDCZK=X',
        'EUR': 'EURCZK=X', 
        'GBP': 'GBPCZK=X',
        'CHF': 'CHFCZK=X',
    }
    
    # Currencies that need cross-rate via USD (no direct CZK pair available)
    CROSS_RATE_CURRENCIES = ['HKD', 'JPY', 'CAD', 'AUD', 'CNY', 'SGD', 'TWD', 'KRW', 'SEK', 'NOK', 'DKK']
    
    # Fallback rates (approximate values)
    FALLBACK_RATES = {
        'CZK': 1.0, 'USD': 23.5, 'EUR': 25.5, 'GBP': 30.0, 'CHF': 27.0,
        'HKD': 3.0, 'JPY': 0.16, 'CAD': 17.0, 'AUD': 15.0,
        'CNY': 3.3, 'SEK': 2.2, 'NOK': 2.1, 'DKK': 3.4,
        'SGD': 17.5, 'TWD': 0.73, 'KRW': 0.017,
    }
    
    def __init__(self):
        self.redis = get_redis()  # Uses shared connection pool
    
    async def get_rates(self) -> Dict[str, float]:
        """
        Get exchange rates to CZK.
        Returns dict like: {'USD': 23.45, 'EUR': 25.10, 'GBP': 29.80, 'HKD': 3.01}
        Uses cross-rate via USD for currencies without direct CZK pair.
        """
        # Check cache first
        cached = await self.redis.get("exchange_rates:czk")
        if cached:
            return json.loads(cached)
        
        rates = {'CZK': 1.0}  # CZK to CZK is always 1

        try:
            # Fetch all tickers in a single batch
            cross_tickers = {curr: f'{curr}USD=X' for curr in self.CROSS_RATE_CURRENCIES}
            all_tickers = list(self.DIRECT_PAIRS.values()) + list(cross_tickers.values())
            data = yf.download(" ".join(all_tickers), period="1d", progress=False)

            # Step 1: Process direct pairs (USD, EUR, GBP, CHF to CZK)
            for currency, ticker in self.DIRECT_PAIRS.items():
                try:
                    rate = float(data['Close'][ticker].iloc[-1])
                    if math.isnan(rate):
                        raise ValueError("NaN rate")
                    rates[currency] = round(rate, 4)
                except Exception:
                    rates[currency] = self.FALLBACK_RATES.get(currency, 1.0)

            # Step 2: Calculate cross-rates via USD
            # e.g., HKD/CZK = HKD/USD * USD/CZK
            usd_czk = rates.get('USD', 23.5)
            for currency, ticker in cross_tickers.items():
                try:
                    curr_to_usd = float(data['Close'][ticker].iloc[-1])
                    if math.isnan(curr_to_usd):
                        raise ValueError("NaN rate")
                    rates[currency] = round(curr_to_usd * usd_czk, 4)
                except Exception as e:
                    logger.warning(f"Failed to get cross rate for {currency}: {e}")
                    rates[currency] = self.FALLBACK_RATES.get(currency, 1.0)
            
            await self.redis.set("exchange_rates:czk", json.dumps(rates), ex=CacheTTL.EXCHANGE_RATES)
            
        except Exception as e:
            logger.error(f"Error fetching exchange rates: {e}")
            # Return fallback rates
            rates = self.FALLBACK_RATES.copy()
        
        return rates
    
    async def convert_to_czk(self, amount: float, from_currency: str) -> float:
        """Convert amount from given currency to CZK."""
        if from_currency == 'CZK':
            return amount
        
        rates = await self.get_rates()
        rate = rates.get(from_currency, 1.0)
        return round(amount * rate, 2)


# Singleton instance using shared Redis pool
exchange_service = ExchangeRateService()
