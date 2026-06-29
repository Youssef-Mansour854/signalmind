import os
from typing import List, Dict

# Environment variables
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")

# Stock Lists (Sharia-Compliant Only)
US_STOCKS: List[str] = [
    # Technology
    "AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMD", "INTC", "CRM", "ADBE", "ORCL", "QCOM", "AVGO", "ASML",
    # Automotive / EV
    "TSLA",
    # Healthcare
    "LLY", "JNJ", "PFE", "ABBV", "MRK", "TMO", "ABT",
    # Consumer & Retail
    "AMZN", "PG", "KO", "PEP", "WMT", "COST", "NKE",
    # Industrial & Energy
    "HON", "GE", "CAT", "BA", "XOM", "CVX",
]
EGX_STOCKS: List[str] = [
    "TMGH.CA",  # طلعت مصطفى
    "PHDC.CA",  # بالم هيلز
    "OCDI.CA",  # سوديك
    "MASR.CA",  # مدينة مصر للإسكان
    "ORHD.CA",  # أوراسكوم للتنمية
    "ADIB.CA",  # مصرف أبوظبي الإسلامي
    "FAIT.CA",  # بنك فيصل الإسلامي
    "SAUD.CA",  # بنك البركة مصر
    "EFIH.CA",  # إي فاينانس
    "ETEL.CA",  # المصرية للاتصالات
    "JUFO.CA",  # جهينة
    "EFID.CA",  # إيديتا
    "OLFI.CA",  # عبور لاند
    "ISPH.CA",  # ابن سينا فارما
    "RMDA.CA",  # راميدا للأدوية
    "AMOC.CA",  # أموك
    "SKPC.CA",  # سيدي كرير للبتروكيماويات
    "EGAL.CA",  # مصر للألومنيوم
    "ORAS.CA",  # أوراسكوم كونستراكشون
    "ORWE.CA",  # النساجون الشرقيون
    "EGAS.CA",  # غاز مصر
    "MTIE.CA"   # إم إم جروب
]

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
    if not GROQ_API_KEY:
        missing_vars.append("GROQ_API_KEY")
    if not TELEGRAM_BOT_TOKEN:
        missing_vars.append("TELEGRAM_BOT_TOKEN")
    if not TELEGRAM_CHAT_ID:
        missing_vars.append("TELEGRAM_CHAT_ID")
        
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")