"""
Technical indicators calculation and signals generation
"""
import yfinance as yf
import pandas as pd
import json
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


async def get_raw_history_with_indicators(redis, ticker: str) -> Optional[pd.DataFrame]:
    """
    L1 Cache: Get raw 2-year history with all indicators calculated.
    Cached for 1 hour to minimize yfinance calls.
    
    Returns DataFrame with all indicator columns, or None if not available.
    """
    cache_key = f"raw_technical:{ticker}"
    cached = await redis.get(cache_key)
    
    if cached:
        # Reconstruct DataFrame from cached JSON
        data = json.loads(cached)
        df = pd.DataFrame(data)
        # Handle mixed timezone issue by converting to UTC
        df['date'] = pd.to_datetime(df['date'], utc=True)
        return df
    
    try:
        t = yf.Ticker(ticker)
        # Get 2 years of history (need ~250 days for SMA200)
        hist = t.history(period="2y", interval="1d")
        
        if hist.empty or len(hist) < 50:
            return None
        
        df = hist.copy()
        df = df.reset_index()
        df.columns = df.columns.str.lower()
        
        # Rename 'date' column if needed
        if 'date' not in df.columns and 'datetime' not in df.columns:
            df = df.rename(columns={df.columns[0]: 'date'})
        
        # ============================================================
        # CALCULATE ALL INDICATORS
        # ============================================================
        
        # SMA (Simple Moving Average)
        df['sma50'] = df['close'].rolling(window=50).mean()
        df['sma200'] = df['close'].rolling(window=200).mean()
        
        # RSI (Relative Strength Index)
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss.replace(0, float('nan'))
        df['rsi14'] = 100 - (100 / (1 + rs))
        
        # MACD (Moving Average Convergence Divergence)
        ema12 = df['close'].ewm(span=12, adjust=False).mean()
        ema26 = df['close'].ewm(span=26, adjust=False).mean()
        df['macd'] = ema12 - ema26
        df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
        df['macd_histogram'] = df['macd'] - df['macd_signal']
        
        # Bollinger Bands
        df['bb_middle'] = df['close'].rolling(window=20).mean()
        bb_std = df['close'].rolling(window=20).std()
        df['bb_upper'] = df['bb_middle'] + (bb_std * 2)
        df['bb_lower'] = df['bb_middle'] - (bb_std * 2)
        
        # Stochastic Oscillator
        low14 = df['low'].rolling(window=14).min()
        high14 = df['high'].rolling(window=14).max()
        df['stoch_k'] = 100 * ((df['close'] - low14) / (high14 - low14))
        df['stoch_d'] = df['stoch_k'].rolling(window=3).mean()
        
        # ATR (Average True Range)
        tr1 = df['high'] - df['low']
        tr2 = (df['high'] - df['close'].shift()).abs()
        tr3 = (df['low'] - df['close'].shift()).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        df['atr14'] = tr.rolling(window=14).mean()
        df['atr_percent'] = (df['atr14'] / df['close']) * 100
        
        # OBV (On-Balance Volume)
        obv = [0]
        for i in range(1, len(df)):
            if df['close'].iloc[i] > df['close'].iloc[i-1]:
                obv.append(obv[-1] + df['volume'].iloc[i])
            elif df['close'].iloc[i] < df['close'].iloc[i-1]:
                obv.append(obv[-1] - df['volume'].iloc[i])
            else:
                obv.append(obv[-1])
        df['obv'] = obv
        df['obv_sma'] = df['obv'].rolling(window=20).mean()
        
        # ADX (Average Directional Index)
        plus_dm = df['high'].diff()
        minus_dm = df['low'].shift() - df['low']
        plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
        minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)
        
        atr14_for_adx = tr.rolling(window=14).mean()
        plus_di = 100 * (plus_dm.rolling(window=14).mean() / atr14_for_adx)
        minus_di = 100 * (minus_dm.rolling(window=14).mean() / atr14_for_adx)
        dx = 100 * (abs(plus_di - minus_di) / (plus_di + minus_di))
        df['adx'] = dx.rolling(window=14).mean()
        df['plus_di'] = plus_di
        df['minus_di'] = minus_di
        
        # Volume analysis
        df['volume_sma20'] = df['volume'].rolling(window=20).mean()
        
        # ============================================================
        # CACHE RAW DATA (1 hour TTL)
        # ============================================================
        
        # Convert to JSON-serializable format
        df_for_cache = df.copy()
        df_for_cache['date'] = df_for_cache['date'].astype(str)
        cache_data = df_for_cache.to_dict(orient='records')
        
        # Cache for 1 hour (3600 seconds)
        await redis.set(cache_key, json.dumps(cache_data), ex=3600)
        
        return df
        
    except Exception as e:
        logger.error(f"Error fetching raw history for {ticker}: {e}", exc_info=True)
        return None


def generate_technical_signals(current: dict, df: pd.DataFrame) -> dict:
    """
    Generate signal interpretations from technical indicators.
    """
    signals = {}
    
    # MACD Trend
    macd = current.get("macd")
    macd_signal = current.get("macdSignal")
    if macd is not None and macd_signal is not None:
        if macd > macd_signal:
            signals["macdTrend"] = "bullish"
        elif macd < macd_signal:
            signals["macdTrend"] = "bearish"
        else:
            signals["macdTrend"] = "neutral"
    else:
        signals["macdTrend"] = None
    
    # Bollinger Signal
    bb_pos = current.get("bollingerPosition")
    if bb_pos is not None:
        if bb_pos > 100:
            signals["bollingerSignal"] = "overbought"
        elif bb_pos < 0:
            signals["bollingerSignal"] = "oversold"
        else:
            signals["bollingerSignal"] = "neutral"
    else:
        signals["bollingerSignal"] = None
    
    # Stochastic Signal
    stoch_k = current.get("stochasticK")
    if stoch_k is not None:
        if stoch_k > 80:
            signals["stochasticSignal"] = "overbought"
        elif stoch_k < 20:
            signals["stochasticSignal"] = "oversold"
        else:
            signals["stochasticSignal"] = "neutral"
    else:
        signals["stochasticSignal"] = None
    
    # Volume Signal
    vol_change = current.get("volumeChange")
    if vol_change is not None:
        if vol_change > 50:
            signals["volumeSignal"] = "high"
        elif vol_change < -50:
            signals["volumeSignal"] = "low"
        else:
            signals["volumeSignal"] = "normal"
    else:
        signals["volumeSignal"] = None
    
    # ATR Signal (volatility)
    atr_pct = current.get("atrPercent")
    if atr_pct is not None:
        if atr_pct > 5:
            signals["atrSignal"] = "high"
        elif atr_pct < 2:
            signals["atrSignal"] = "low"
        else:
            signals["atrSignal"] = "normal"
    else:
        signals["atrSignal"] = None
    
    # OBV Trend (compare last value to 20-period SMA)
    obv = current.get("obv")
    if obv is not None and len(df) >= 20:
        obv_values = df['obv'].tail(20).tolist()
        obv_start = obv_values[0] if obv_values else 0
        obv_end = obv_values[-1] if obv_values else 0
        if obv_end > obv_start * 1.05:
            signals["obvTrend"] = "bullish"
        elif obv_end < obv_start * 0.95:
            signals["obvTrend"] = "bearish"
        else:
            signals["obvTrend"] = "neutral"
    else:
        signals["obvTrend"] = None
    
    # OBV Divergence (price up + OBV down = bearish, price down + OBV up = bullish)
    if len(df) >= 20:
        price_start = df['close'].iloc[-20] if pd.notna(df['close'].iloc[-20]) else None
        price_end = df['close'].iloc[-1] if pd.notna(df['close'].iloc[-1]) else None
        obv_start = df['obv'].iloc[-20] if pd.notna(df['obv'].iloc[-20]) else None
        obv_end = df['obv'].iloc[-1] if pd.notna(df['obv'].iloc[-1]) else None
        
        if all([price_start, price_end, obv_start, obv_end]):
            price_up = price_end > price_start
            obv_up = obv_end > obv_start
            
            if price_up and not obv_up:
                signals["obvDivergence"] = "bearish"
            elif not price_up and obv_up:
                signals["obvDivergence"] = "bullish"
            else:
                signals["obvDivergence"] = None
        else:
            signals["obvDivergence"] = None
    else:
        signals["obvDivergence"] = None
    
    # ADX Signal (trend strength)
    adx = current.get("adx")
    if adx is not None:
        if adx >= 40:
            signals["adxSignal"] = "strong"
        elif adx >= 25:
            signals["adxSignal"] = "moderate"
        elif adx >= 20:
            signals["adxSignal"] = "weak"
        else:
            signals["adxSignal"] = "no-trend"
    else:
        signals["adxSignal"] = None
    
    # ADX Trend direction (+DI vs -DI)
    plus_di = current.get("plusDI")
    minus_di = current.get("minusDI")
    if plus_di is not None and minus_di is not None:
        if plus_di > minus_di * 1.1:
            signals["adxTrend"] = "bullish"
        elif minus_di > plus_di * 1.1:
            signals["adxTrend"] = "bearish"
        else:
            signals["adxTrend"] = "neutral"
    else:
        signals["adxTrend"] = None
    
    # Trend Signal (overall based on SMAs)
    price = current.get("currentPrice")
    sma50 = current.get("sma50")
    sma200 = current.get("sma200")
    
    if price and sma50 and sma200:
        price_above_50 = price > sma50
        price_above_200 = price > sma200
        golden_cross = sma50 > sma200
        
        if golden_cross and price_above_50 and price_above_200:
            signals["trendSignal"] = "strong_bullish"
            signals["trendDescription"] = "Golden Cross s cenou nad oběma průměry. Silný růstový trend."
        elif golden_cross and price_above_50:
            signals["trendSignal"] = "bullish"
            signals["trendDescription"] = "Golden Cross aktivní. Cena nad 50 DMA, vznikající uptrend."
        elif golden_cross:
            signals["trendSignal"] = "mixed"
            signals["trendDescription"] = "Golden Cross aktivní, ale cena pod průměry. Možná korekce."
        elif not golden_cross and not price_above_50 and not price_above_200:
            signals["trendSignal"] = "strong_bearish"
            signals["trendDescription"] = "Death Cross s cenou pod oběma průměry. Silný klesající trend."
        elif not golden_cross and not price_above_50:
            signals["trendSignal"] = "bearish"
            signals["trendDescription"] = "Death Cross aktivní. Cena pod 50 DMA, klesající trend."
        else:
            signals["trendSignal"] = "mixed"
            signals["trendDescription"] = "Protichůdné signály. Vyčkejte na jasný směr."
    else:
        signals["trendSignal"] = None
        signals["trendDescription"] = "Nedostatek dat pro určení trendu."
    
    return signals


async def get_technical_indicators(redis, ticker: str, period: str = "1y") -> Optional[dict]:
    """
    Calculate technical indicators for a stock.
    Returns current values and historical data for charts.
    
    Uses 2-layer caching:
    - L1: Raw 2y history with indicators (1 hour TTL) - saves yfinance calls
    - L2: Filtered result per period (5 min TTL) - fast response
    
    Indicators:
    - SMA (50, 200)
    - RSI (14)
    - MACD (12, 26, 9)
    - Bollinger Bands (20, 2)
    - Stochastic (14, 3, 3)
    - ATR (14)
    - OBV
    - ADX (14)
    """
    # L2 Cache: Check for pre-computed result for this period
    cache_key = f"technical:{ticker}:{period}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        # L1 Cache: Get raw data with all indicators (may be cached)
        df = await get_raw_history_with_indicators(redis, ticker)
        
        if df is None or len(df) < 50:
            return None
        
        # ============================================================
        # FILTER DATA BY PERIOD
        # ============================================================
        
        period_days = {
            "1w": 7,
            "1mo": 30,
            "3mo": 90,
            "6mo": 180,
            "1y": 365,
            "2y": 730,
        }
        days = period_days.get(period, 365)
        df_filtered = df.tail(days).copy()
        
        # ============================================================
        # GET CURRENT VALUES
        # ============================================================
        
        last = df_filtered.iloc[-1]
        current_price = float(last['close']) if pd.notna(last['close']) else None
        
        def safe_float(val):
            return round(float(val), 4) if pd.notna(val) else None
        
        # Current indicator values
        current = {
            "ticker": ticker,
            "currentPrice": current_price,
            "sma50": safe_float(last['sma50']),
            "sma200": safe_float(last['sma200']),
            "rsi14": safe_float(last['rsi14']),
            "macd": safe_float(last['macd']),
            "macdSignal": safe_float(last['macd_signal']),
            "macdHistogram": safe_float(last['macd_histogram']),
            "bollingerUpper": safe_float(last['bb_upper']),
            "bollingerMiddle": safe_float(last['bb_middle']),
            "bollingerLower": safe_float(last['bb_lower']),
            "stochasticK": safe_float(last['stoch_k']),
            "stochasticD": safe_float(last['stoch_d']),
            "atr14": safe_float(last['atr14']),
            "atrPercent": safe_float(last['atr_percent']),
            "obv": safe_float(last['obv']),
            "adx": safe_float(last['adx']),
            "plusDI": safe_float(last['plus_di']),
            "minusDI": safe_float(last['minus_di']),
            "currentVolume": int(last['volume']) if pd.notna(last['volume']) else None,
            "avgVolume20": safe_float(last['volume_sma20']),
        }
        
        # Calculate derived values
        if current["currentPrice"] and current["sma50"]:
            current["priceVsSma50"] = round(
                ((current["currentPrice"] - current["sma50"]) / current["sma50"]) * 100, 2
            )
        else:
            current["priceVsSma50"] = None
            
        if current["currentPrice"] and current["sma200"]:
            current["priceVsSma200"] = round(
                ((current["currentPrice"] - current["sma200"]) / current["sma200"]) * 100, 2
            )
        else:
            current["priceVsSma200"] = None
        
        # Bollinger position (0-100, 0=lower band, 100=upper band)
        if current["bollingerUpper"] and current["bollingerLower"] and current["currentPrice"]:
            bb_range = current["bollingerUpper"] - current["bollingerLower"]
            if bb_range > 0:
                current["bollingerPosition"] = round(
                    ((current["currentPrice"] - current["bollingerLower"]) / bb_range) * 100, 1
                )
            else:
                current["bollingerPosition"] = 50
        else:
            current["bollingerPosition"] = None
        
        # Volume change vs average
        if current["currentVolume"] and current["avgVolume20"]:
            current["volumeChange"] = round(
                ((current["currentVolume"] - current["avgVolume20"]) / current["avgVolume20"]) * 100, 1
            )
        else:
            current["volumeChange"] = None
        
        # ============================================================
        # GENERATE SIGNALS
        # ============================================================
        
        signals = generate_technical_signals(current, df_filtered)
        current.update(signals)
        
        # ============================================================
        # BUILD HISTORY ARRAYS FOR CHARTS
        # ============================================================
        
        def format_date(dt):
            if hasattr(dt, 'isoformat'):
                return dt.isoformat()
            return str(dt)
        
        # Price + SMA history
        price_history = []
        for _, row in df_filtered.iterrows():
            price_history.append({
                "date": format_date(row['date']),
                "price": safe_float(row['close']),
                "sma50": safe_float(row['sma50']),
                "sma200": safe_float(row['sma200']),
            })
        
        # MACD history
        macd_history = []
        for _, row in df_filtered.iterrows():
            macd_history.append({
                "date": format_date(row['date']),
                "macd": safe_float(row['macd']),
                "signal": safe_float(row['macd_signal']),
                "histogram": safe_float(row['macd_histogram']),
            })
        
        # Bollinger history
        bollinger_history = []
        for _, row in df_filtered.iterrows():
            bollinger_history.append({
                "date": format_date(row['date']),
                "price": safe_float(row['close']),
                "upper": safe_float(row['bb_upper']),
                "middle": safe_float(row['bb_middle']),
                "lower": safe_float(row['bb_lower']),
            })
        
        # Stochastic history
        stochastic_history = []
        for _, row in df_filtered.iterrows():
            stochastic_history.append({
                "date": format_date(row['date']),
                "k": safe_float(row['stoch_k']),
                "d": safe_float(row['stoch_d']),
            })
        
        # RSI history
        rsi_history = []
        for _, row in df_filtered.iterrows():
            rsi_history.append({
                "date": format_date(row['date']),
                "rsi": safe_float(row['rsi14']),
            })
        
        # Volume history
        volume_history = []
        for _, row in df_filtered.iterrows():
            avg_vol = safe_float(row['volume_sma20'])
            vol = int(row['volume']) if pd.notna(row['volume']) else 0
            volume_history.append({
                "date": format_date(row['date']),
                "volume": vol,
                "avgVolume": avg_vol,
                "isAboveAvg": vol > (avg_vol or 0) if avg_vol else False,
            })
        
        # ATR history
        atr_history = []
        for _, row in df_filtered.iterrows():
            atr_history.append({
                "date": format_date(row['date']),
                "atr": safe_float(row['atr14']),
                "atrPercent": safe_float(row['atr_percent']),
            })
        
        # OBV history
        obv_history = []
        for _, row in df_filtered.iterrows():
            obv_history.append({
                "date": format_date(row['date']),
                "obv": safe_float(row['obv']),
                "obvSma": safe_float(row['obv_sma']),
            })
        
        # ADX history
        adx_history = []
        for _, row in df_filtered.iterrows():
            adx_history.append({
                "date": format_date(row['date']),
                "adx": safe_float(row['adx']),
                "plusDI": safe_float(row['plus_di']),
                "minusDI": safe_float(row['minus_di']),
            })
        
        # ============================================================
        # FIBONACCI RETRACEMENT
        # ============================================================
        
        period_high = df_filtered['high'].max()
        period_low = df_filtered['low'].min()
        fib_range = period_high - period_low
        
        # Standard Fibonacci levels
        fib_levels = {
            "0": safe_float(period_low),
            "236": safe_float(period_low + fib_range * 0.236),
            "382": safe_float(period_low + fib_range * 0.382),
            "500": safe_float(period_low + fib_range * 0.5),
            "618": safe_float(period_low + fib_range * 0.618),
            "786": safe_float(period_low + fib_range * 0.786),
            "1000": safe_float(period_high),
        }
        
        # Current price position relative to Fibonacci
        if fib_range > 0 and current_price:
            fib_position = ((current_price - period_low) / fib_range) * 100
        else:
            fib_position = 50
        
        # Determine nearest Fibonacci level
        fib_level_values = [
            (0, fib_levels["0"]),
            (23.6, fib_levels["236"]),
            (38.2, fib_levels["382"]),
            (50, fib_levels["500"]),
            (61.8, fib_levels["618"]),
            (78.6, fib_levels["786"]),
            (100, fib_levels["1000"]),
        ]
        
        nearest_fib = None
        nearest_distance = float('inf')
        for level_pct, level_price in fib_level_values:
            if level_price and current_price:
                distance = abs(current_price - level_price)
                if distance < nearest_distance:
                    nearest_distance = distance
                    nearest_fib = level_pct
        
        # Fibonacci history (price with levels for chart)
        fibonacci_history = []
        for _, row in df_filtered.iterrows():
            fibonacci_history.append({
                "date": format_date(row['date']),
                "price": safe_float(row['close']),
                "high": safe_float(row['high']),
                "low": safe_float(row['low']),
            })
        
        # ============================================================
        # BUILD RESULT
        # ============================================================
        
        result = {
            **current,
            "priceHistory": price_history,
            "macdHistory": macd_history,
            "bollingerHistory": bollinger_history,
            "stochasticHistory": stochastic_history,
            "rsiHistory": rsi_history,
            "volumeHistory": volume_history,
            "atrHistory": atr_history,
            "obvHistory": obv_history,
            "adxHistory": adx_history,
            "fibonacciLevels": fib_levels,
            "fibonacciPosition": safe_float(fib_position),
            "nearestFibLevel": nearest_fib,
            "periodHigh": safe_float(period_high),
            "periodLow": safe_float(period_low),
            "fibonacciHistory": fibonacci_history,
            "lastUpdated": str(pd.Timestamp.now()),
        }
        
        # Cache for 5 minutes
        await redis.set(cache_key, json.dumps(result), ex=300)
        return result
        
    except Exception as e:
        logger.error(f"Error calculating technical indicators for {ticker}: {e}", exc_info=True)
        return None
