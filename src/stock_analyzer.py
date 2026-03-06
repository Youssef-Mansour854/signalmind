import requests
import pandas as pd
import ta
import numpy as np
from typing import Dict, Optional
import time

ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query"

class StockAnalyzer:
    def __init__(self, config):
        self.config = config
        self.params = config.INDICATOR_PARAMS
        self.api_key = config.ALPHA_VANTAGE_KEY

    def fetch_data(self, symbol: str) -> Optional[pd.DataFrame]:
        """Fetches historical stock data using Alpha Vantage."""
        try:
            clean_symbol = symbol.replace(".CA", "")

            params = {
                "function": "TIME_SERIES_DAILY",
                "symbol": clean_symbol,
                "outputsize": "full",
                "apikey": self.api_key
            }

            response = requests.get(ALPHA_VANTAGE_BASE, params=params)
            data = response.json()

            if "Time Series (Daily)" not in data:
                print(f"No data found for {symbol}: {data.get('Note') or data.get('Information') or 'Unknown error'}")
                return None

            ts = data["Time Series (Daily)"]
            df = pd.DataFrame.from_dict(ts, orient="index")
            df.index = pd.to_datetime(df.index)
            df = df.sort_index()
            df.columns = ["Open", "High", "Low", "Close", "Volume"]
            df = df.astype(float)

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

        df['EMA_50'] = ta.trend.EMAIndicator(
            df['Close'], window=50
        ).ema_indicator()

        df['EMA_200'] = ta.trend.EMAIndicator(
            df['Close'], window=200
        ).ema_indicator()

        # Volume Analysis
        df['Volume_Avg'] = df['Volume'].rolling(window=self.params['volume_avg_period']).mean()

        # Support and Resistance
        last_30_days = df.tail(self.params['sup_res_period'])
        df['Support'] = last_30_days['Low'].min()
        df['Resistance'] = last_30_days['High'].max()

        # Bollinger Bands
        bb = ta.volatility.BollingerBands(close=df['Close'], window=20, window_dev=2)
        df['BB_High'] = bb.bollinger_hband()
        df['BB_Low'] = bb.bollinger_lband()
        df['BB_Mid'] = bb.bollinger_mavg()

        # Stochastic RSI
        stoch_rsi = ta.momentum.StochRSIIndicator(close=df['Close'], window=14, smooth1=3, smooth2=3)
        df['StochRSI_K'] = stoch_rsi.stochrsi_k()
        df['StochRSI_D'] = stoch_rsi.stochrsi_d()

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
            'ema_50': latest['EMA_50'],
            'ema_200': latest['EMA_200'],
            'support': latest['Support'],
            'resistance': latest['Resistance'],
            'bb_high': latest['BB_High'],
            'bb_low': latest['BB_Low'],
            'bb_mid': latest['BB_Mid'],
            'stoch_rsi_k': latest['StochRSI_K'],
            'stoch_rsi_d': latest['StochRSI_D']
        }

        for k, v in data.items():
            if isinstance(v, (int, float)) and pd.notna(v):
                data[k] = round(v, 4) if v < 100 else round(v, 2)
            else:
                data[k] = None

        return data

    def is_in_macro_downtrend(self, data: Dict) -> bool:
        """
        Relaxed macro filter:
        Skip stock only if BOTH conditions are true:
        - Price is below EMA 50
        - EMA 50 is below EMA 200
        """
        close = data.get('close')
        ema_50 = data.get('ema_50')
        ema_200 = data.get('ema_200')

        if not all([close, ema_50, ema_200]):
            return False  # If data missing, don't skip

        return False

    def analyze_stock(self, symbol: str) -> Optional[Dict]:
        """Full pipeline for a single stock."""
        df = self.fetch_data(symbol)
        if df is None:
            return None

        df = self.calculate_indicators(df)
        latest_data = self.get_latest_data(df)
        latest_data['symbol'] = symbol

        # Macro trend filter
        if self.is_in_macro_downtrend(latest_data):
            print(f"Skipped {symbol}: In a macro downtrend (price < EMA50 < EMA200)")
            return None

        return latest_data
