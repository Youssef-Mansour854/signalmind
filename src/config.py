import os
from typing import List, Dict

# Environment variables
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_KEY")

# Stock Lists
US_STOCKS: List[str] = ["AAPL", "TSLA", "NVDA", "AMZN", "MSFT"]
EGX_STOCKS: List[str] = ["COMI.CA", "EKHO.CA", "HRHO.CA"]

# Analysis Parameters
INDICATOR_PARAMS = {
    'rsi_period': 14,
    'macd_fast': 12,
    'macd_slow': 26,
    'macd_signal': 9,
    'sma_fast': 20,
    'sma_slow': 50,
    'ema_fast': 20,
    'volume_avg_period': 20,
    'sup_res_period': 30
}

# Anthropic API Settings
GEMINI_MODEL = "gemini-2.0-flash"
API_DELAY_SECONDS = 1  # Delay to avoid rate limits

# Telegram Settings
DISCLAIMER_TEXT = "هذه التوصيات للأغراض التعليمية فقط وليست نصيحة مالية"

def validate_config():
    """Validates that all required environment variables are set."""
    missing_vars = []
    if not GEMINI_API_KEY:
        missing_vars.append("GEMINI_API_KEY")
    if not TELEGRAM_BOT_TOKEN:
        missing_vars.append("TELEGRAM_BOT_TOKEN")
    if not TELEGRAM_CHAT_ID:
        missing_vars.append("TELEGRAM_CHAT_ID")
    if not ALPHA_VANTAGE_KEY:
        missing_vars.append("ALPHA_VANTAGE_KEY")
        
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
