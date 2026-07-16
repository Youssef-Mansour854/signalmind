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
    # Curated 150 Shariah-compliant US stocks
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "GOOG", "TSLA", "LLY", "AVGO",
    "JNJ", "PG", "MRK", "ABBV", "ADBE", "CRM", "AMD", "TMO", "ABT", "AMGN",
    "PEP", "COST", "KO", "NKE", "CSCO", "WMT", "CVX", "XOM", "ORCL", "HD",
    "LOW", "TJX", "TGT", "HON", "GE", "CAT", "COP", "SLB", "DE", "INTU",
    "QCOM", "TXN", "AMAT", "MU", "LRCX", "NOW", "PANW", "KLAC", "SNPS", "CDNS",
    "FTNT", "ANET", "ADSK", "MCHP", "MPWR", "ON", "NXPI", "MRVL", "ASML", "ISRG",
    "GILD", "REGN", "VRTX", "BMY", "MDT", "CVS", "CI", "BDX", "MCK", "HCA",
    "BSX", "DHR", "SYK", "ZBH", "EW", "ALGN", "DXCM", "PODD", "MTD", "ILMN",
    "EL", "CL", "KMB", "LULU", "DECK", "CROX", "EOG", "MPC", "PSX", "VLO",
    "OXY", "HAL", "BKR", "HES", "FANG", "UNP", "UPS", "FDX", "NSC", "CSX",
    "WM", "RSG", "EMR", "ITW", "ETN", "PH", "ROP", "FAST", "GWW", "APD",
    "ECL", "SHW", "FCX", "NEM", "CTVA", "DD", "ALB", "FMC", "NUE", "RMD",
    "BIIB", "TECH", "IQV", "WST", "STE", "ZTS", "IDXX", "ORLY", "AZO", "TSCO",
    "ULTA", "ROST", "DLTR", "DG", "YUM", "SBUX", "CMG", "DRI", "MAR", "H",
    "EXPE", "BKNG", "RCL", "NCLH", "CCL", "WDC", "STX", "HPQ", "HPE", "NTAP"
]

# Temporarily paused EGX market
EGX_STOCKS: List[str] = []

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