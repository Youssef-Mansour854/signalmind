import datetime
import time
from typing import Tuple, Dict, Any, Optional
import yfinance as yf

CACHE_TTL_DAYS = 90  # Matches financial quarterly reporting cycle

def check_sharia_compliance(symbol: str, db: Any = None) -> Tuple[bool, str]:
    """
    Checks Sharia compliance based on financial ratios:
    1. Debt Ratio = Total Debt / Market Cap <= 33% (0.33)
    2. Cash Ratio = Total Cash / Market Cap <= 33% (0.33)

    Uses MongoDB caching with 90-day expiration to prevent redundant API calls.
    Returns: (is_compliant: bool, reason: str)
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    # 1. Check MongoDB Cache first
    if db is not None:
        try:
            cache_col = db["sharia_cache"]
            cached_doc = cache_col.find_one({"symbol": symbol})
            if cached_doc:
                updated_at = cached_doc.get("updatedAt")
                if updated_at:
                    if updated_at.tzinfo is None:
                        updated_at = updated_at.replace(tzinfo=datetime.timezone.utc)
                    age_days = (now - updated_at).days
                    if age_days < CACHE_TTL_DAYS:
                        is_compliant = bool(cached_doc.get("isCompliant", False))
                        reason = str(cached_doc.get("reason", "Cached Sharia status"))
                        return is_compliant, f"[CACHED ({age_days}d)] {reason}"
        except Exception as e:
            print(f"[WARNING] Sharia cache read error for {symbol}: {e}")

    # 2. Fetch fresh data from yfinance with retry + backoff + fixed pacing delay
    max_retries = 3
    info = None
    for attempt in range(1, max_retries + 1):
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            if info:
                break
        except Exception as e:
            if attempt < max_retries:
                backoff = 1.5 * attempt
                time.sleep(backoff)

    # Fixed pacing delay between consecutive live API queries to protect yfinance IP
    time.sleep(0.5)

    if not info or not isinstance(info, dict):
        reason = "Sharia check unavailable - missing financial data"
        _cache_result(db, symbol, False, None, None, reason, now)
        return False, reason

    market_cap = info.get("marketCap")
    total_debt = info.get("totalDebt")
    total_cash = info.get("totalCash") or info.get("cash")

    # Safe missing data handling (TypeError prevention & safe rejection)
    if market_cap is None or total_debt is None or total_cash is None:
        reason = f"Sharia check unavailable - missing financial data (MarketCap: {market_cap}, Debt: {total_debt}, Cash: {total_cash})"
        _cache_result(db, symbol, False, None, None, reason, now)
        return False, reason

    try:
        market_cap = float(market_cap)
        total_debt = float(total_debt)
        total_cash = float(total_cash)

        if market_cap <= 0:
            reason = "Sharia check unavailable - non-positive market cap"
            _cache_result(db, symbol, False, None, None, reason, now)
            return False, reason

        debt_ratio = round(total_debt / market_cap, 4)
        cash_ratio = round(total_cash / market_cap, 4)

        if debt_ratio > 0.33:
            reason = f"Non-compliant Debt ratio ({debt_ratio * 100:.2f}% > 33.0%)"
            _cache_result(db, symbol, False, debt_ratio, cash_ratio, reason, now)
            return False, reason

        if cash_ratio > 0.33:
            reason = f"Non-compliant Cash ratio ({cash_ratio * 100:.2f}% > 33.0%)"
            _cache_result(db, symbol, False, debt_ratio, cash_ratio, reason, now)
            return False, reason

        reason = f"Compliant (Debt: {debt_ratio * 100:.2f}%, Cash: {cash_ratio * 100:.2f}%)"
        _cache_result(db, symbol, True, debt_ratio, cash_ratio, reason, now)
        return True, reason

    except (TypeError, ValueError, ZeroDivisionError) as e:
        reason = f"Sharia check unavailable - calculation error ({e})"
        _cache_result(db, symbol, False, None, None, reason, now)
        return False, reason

def _cache_result(db: Any, symbol: str, is_compliant: bool, debt_ratio: Optional[float], cash_ratio: Optional[float], reason: str, now: datetime.datetime):
    if db is None:
        return
    try:
        cache_col = db["sharia_cache"]
        cache_doc = {
            "symbol": symbol,
            "isCompliant": is_compliant,
            "debtRatio": debt_ratio,
            "cashRatio": cash_ratio,
            "reason": reason,
            "updatedAt": now
        }
        cache_col.update_one({"symbol": symbol}, {"$set": cache_doc}, upsert=True)
    except Exception as e:
        print(f"[WARNING] Sharia cache write error for {symbol}: {e}")
