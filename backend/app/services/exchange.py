import yfinance as yf
import redis.asyncio as redis
import json
from typing import Dict
from app.core.config import get_settings

class ExchangeRateService:
    """Service for fetching and caching exchange rates to CZK."""
    
    # Currency pairs to fetch (all to CZK)
    PAIRS = {
        'USD': 'USDCZK=X',
        'EUR': 'EURCZK=X', 
        'GBP': 'GBPCZK=X',
        'CHF': 'CHFCZK=X',
    }
    
    def __init__(self, redis_url: str = "redis://redis:6379/0"):
        self.redis = redis.from_url(redis_url)
    
    async def get_rates(self) -> Dict[str, float]:
        """
        Get exchange rates to CZK.
        Returns dict like: {'USD': 23.45, 'EUR': 25.10, 'GBP': 29.80}
        """
        # Check cache first
        cached = await self.redis.get("exchange_rates:czk")
        if cached:
            return json.loads(cached)
        
        rates = {'CZK': 1.0}  # CZK to CZK is always 1
        
        try:
            # Fetch all pairs at once
            tickers_str = " ".join(self.PAIRS.values())
            data = yf.download(tickers_str, period="1d", progress=False)
            
            for currency, ticker in self.PAIRS.items():
                try:
                    if len(self.PAIRS) == 1:
                        rate = float(data['Close'].iloc[-1])
                    else:
                        rate = float(data['Close'][ticker].iloc[-1])
                    rates[currency] = round(rate, 4)
                except Exception:
                    # Fallback rates if fetch fails
                    fallback = {'USD': 23.5, 'EUR': 25.5, 'GBP': 30.0, 'CHF': 27.0}
                    rates[currency] = fallback.get(currency, 1.0)
            
            # Cache for 1 hour (rates don't change that fast)
            await self.redis.set("exchange_rates:czk", json.dumps(rates), ex=3600)
            
        except Exception as e:
            print(f"Error fetching exchange rates: {e}")
            # Return fallback rates
            rates = {'CZK': 1.0, 'USD': 23.5, 'EUR': 25.5, 'GBP': 30.0, 'CHF': 27.0}
        
        return rates
    
    async def convert_to_czk(self, amount: float, from_currency: str) -> float:
        """Convert amount from given currency to CZK."""
        if from_currency == 'CZK':
            return amount
        
        rates = await self.get_rates()
        rate = rates.get(from_currency, 1.0)
        return round(amount * rate, 2)


settings = get_settings()
exchange_service = ExchangeRateService(redis_url=settings.redis_url)
