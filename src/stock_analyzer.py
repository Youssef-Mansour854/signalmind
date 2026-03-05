import yfinance as yf
import pandas as pd
import ta
import numpy as np
import requests
from typing import Dict, Optional
import time

class StockAnalyzer:
    def __init__(self, config):
        self.config = config
        self.params = config.INDICATOR_PARAMS

    def fetch_data(self, symbol: str, period: str = "6mo") -> Optional[pd.DataFrame]:
        """Fetches historical stock data using yfinance."""
        try:
            session = requests.Session()
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124 Safari/537.36'
            })
            ticker = yf.Ticker(symbol, session=session)
            df = ticker.history(period=period)
            if df.empty:
                print(f"No data found for {symbol}")
                return None
            return df
        except Exception as e:
            print(f"Error fetching data for {symbol}: {e}")
            return None

    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculates technical indicators using ta library."""
        if len(df) < max(self.params.values()):
            print("Not enough data to calculate all indicators")
            return df

        # RSI
        df['RSI_14'] = ta.momentum.RSIIndicator(
            df['Close'], window=self.params['rsi_period']
        ).rsi()

        # MACD
        macd = ta.trend.MACD(
            df['Close'],
            window_slow=self.params['macd_slow'],
            window_fast=self.params['macd_fast'],
            window_sign=self.params['macd_signal']
        )
        df[f"MACD_{self.params['macd_fast']}_{self.params['macd_slow']}_{self.params['macd_signal']}"] = macd.macd()
        df[f"MACDs_{self.params['macd_fast']}_{self.params['macd_slow']}_{self.params['macd_signal']}"] = macd.macd_signal()

        # Moving Averages
        df[f"SMA_{self.params['sma_fast']}"] = ta.trend.SMAIndicator(
            df['Close'], window=self.params['sma_fast']
        ).sma_indicator()

        df[f"SMA_{self.params['sma_slow']}"] = ta.trend.SMAIndicator(
            df['Close'], window=self.params['sma_slow']
        ).sma_indicator()

        df[f"EMA_{self.params['ema_fast']}"] = ta.trend.EMAIndicator(
            df['Close'], window=self.params['ema_fast']
        ).ema_indicator()

        # Volume Analysis
        df['Volume_Avg'] = df['Volume'].rolling(window=self.params['volume_avg_period']).mean()

        # Support and Resistance
        last_30_days = df.tail(self.params['sup_res_period'])
        df['Support'] = last_30_days['Low'].min()
        df['Resistance'] = last_30_days['High'].max()

        return df

    def get_latest_data(self, df: pd.DataFrame) -> Dict:
        """Extracts the most recent state of indicators for analysis."""
        latest = df.iloc[-1]

        rsi_col = f"RSI_{self.params['rsi_period']}"
        macd_col = f"MACD_{self.params['macd_fast']}_{self.params['macd_slow']}_{self.params['macd_signal']}"
        macds_col = f"MACDs_{self.params['macd_fast']}_{self.params['macd_slow']}_{self.params['macd_signal']}"
        sma_fast_col = f"SMA_{self.params['sma_fast']}"
        sma_slow_col = f"SMA_{self.params['sma_slow']}"
        ema_col = f"EMA_{self.params['ema_fast']}"

        data = {
            'close': latest['Close'],
            'volume': latest['Volume'],
            'volume_avg': latest['Volume_Avg'],
            'rsi': latest[rsi_col],
            'macd_line': latest[macd_col],
            'macd_signal': latest[macds_col],
            'sma_20': latest[sma_fast_col],
            'sma_50': latest[sma_slow_col],
            'ema_20': latest[ema_col],
            'support': latest['Support'],
            'resistance': latest['Resistance']
        }

        for k, v in data.items():
            if isinstance(v, (int, float)) and pd.notna(v):
                data[k] = round(v, 4) if v < 100 else round(v, 2)
            else:
                data[k] = None

        return data

    def analyze_stock(self, symbol: str) -> Optional[Dict]:
        """Full pipeline for a single stock."""
        df = self.fetch_data(symbol)
        if df is None:
            return None

        df = self.calculate_indicators(df)
        latest_data = self.get_latest_data(df)
        latest_data['symbol'] = symbol
        return latest_data

if __name__ == "__main__":
    import config
    analyzer = StockAnalyzer(config)
    print("Testing US Stock (AAPL):")
    print(analyzer.analyze_stock("AAPL"))
    print("\nTesting EGX Stock (COMI.CA):")
    print(analyzer.analyze_stock("COMI.CA"))
