import os
from typing import List, Dict
from dotenv import load_dotenv

# Load environmental variables from .env file at module load time
load_dotenv()

# Environment variables
raw_groq_keys = os.environ.get("GROQ_API_KEYS") or os.environ.get("GROQ_API_KEY", "")
GROQ_API_KEYS: List[str] = [k.strip() for k in raw_groq_keys.split(",") if k.strip()]
GROQ_API_KEY = GROQ_API_KEYS[0] if GROQ_API_KEYS else None
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")

# Stock Lists (Sharia-Compliant Only)
US_STOCKS: List[str] = [
    # Technology
    "AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMD", "INTC", "CRM", "ADBE", "ORCL", "QCOM", "AVGO", "ASML",
    "CSCO", "INTU", "AMAT", "LRCX", "PANW", "NOW", "KLAC",
    # Automotive / EV
    "TSLA",
    # Healthcare & Biotech
    "LLY", "JNJ", "PFE", "ABBV", "MRK", "TMO", "ABT", "AMGN", "GILD", "ISRG", "REGN", "VRTX",
    # Consumer & Retail
    "AMZN", "PG", "KO", "PEP", "WMT", "COST", "NKE", "HD", "LOW", "TJX", "TGT",
    # Industrial, Materials & Energy
    "HON", "GE", "CAT", "BA", "XOM", "CVX", "COP", "SLB", "DE"
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

# Groq API Settings
GROQ_MODEL = "llama-3.3-70b-versatile"
API_DELAY_SECONDS = 1  # Delay to avoid rate limits

# Telegram Settings
DISCLAIMER_TEXT = "هذه التوصيات للأغراض التعليمية فقط وليست نصيحة مالية"

def validate_config():
    """Validates that all required environment variables are set."""
    missing_vars = []
    if not GROQ_API_KEYS:
        missing_vars.append("GROQ_API_KEYS")
    
    # Telegram credentials are now optional. Print a warning instead of raising an error.
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("[INFO] Telegram credentials (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) are missing. Telegram notifications will be disabled.")
        
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")