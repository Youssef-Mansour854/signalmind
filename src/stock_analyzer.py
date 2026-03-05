import yfinance as yf
import pandas as pd
import pandas_ta as ta
import numpy as np
from typing import Dict, Optional
import time

class StockAnalyzer:
    def __init__(self, config):
        self.config = config
        self.params = config.INDICATOR_PARAMS

    def fetch_data(self, symbol: str, period: str = "6mo") -> Optional[pd.DataFrame]:
        """Fetches historical stock data using yfinance."""
        try:
            # yfinance handles EGX stocks with .CA suffix natively
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period)
            
            if df.empty:
                print(f"No data found for {symbol}")
                return None
                
            return df
        except Exception as e:
            print(f"Error fetching data for {symbol}: {e}")
            return None

    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculates technical indicators using pandas-ta."""
        # Ensure we have enough data
        if len(df) < max(self.params.values()):
            print("Not enough data to calculate all indicators")
            return df

        # RSI
        df.ta.rsi(length=self.params['rsi_period'], append=True)
        rsi_col = f"RSI_{self.params['rsi_period']}"

        # MACD
        df.ta.macd(fast=self.params['macd_fast'], slow=self.params['macd_slow'], signal=self.params['macd_signal'], append=True)
        macd_col = f"MACD_{self.params['macd_fast']}_{self.params['macd_slow']}_{self.params['macd_signal']}"
        macds_col = f"MACDs_{self.params['macd_fast']}_{self.params['macd_slow']}_{self.params['macd_signal']}"

        # Moving Averages
        df.ta.sma(length=self.params['sma_fast'], append=True)
        sma_fast_col = f"SMA_{self.params['sma_fast']}"
        
        df.ta.sma(length=self.params['sma_slow'], append=True)
        sma_slow_col = f"SMA_{self.params['sma_slow']}"
        
        df.ta.ema(length=self.params['ema_fast'], append=True)
        ema_col = f"EMA_{self.params['ema_fast']}"

        # Volume Analysis
        df['Volume_Avg'] = df['Volume'].rolling(window=self.params['volume_avg_period']).mean()
        
        # Support and Resistance (Basic implementation based on local min/max over 30 days)
        last_30_days = df.tail(self.params['sup_res_period'])
        support = last_30_days['Low'].min()
        resistance = last_30_days['High'].max()
        
        # Assign to the dataframe (broadcasting the single value to all rows)
        df['Support'] = support
        df['Resistance'] = resistance

        return df

    def get_latest_data(self, df: pd.DataFrame) -> Dict:
        """Extracts the most recent state of indicators for analysis."""
        latest = df.iloc[-1]
        
        # Dynamic column names based on params
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
        
        # Format the numbers nicely
        for k, v in data.items():
            if isinstance(v, (int, float)) and pd.notna(v):
                data[k] = round(v, 4) if v < 100 else round(v, 2)
            else:
                data[k] = None # Handle NaN

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
    # Quick test
    analyzer = StockAnalyzer(config)
    print("Testing US Stock (AAPL):")
    print(analyzer.analyze_stock("AAPL"))
    print("\nTesting EGX Stock (COMI.CA):")
    print(analyzer.analyze_stock("COMI.CA"))
