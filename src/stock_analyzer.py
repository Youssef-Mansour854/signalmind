import os
import requests
import pandas as pd
import ta
import numpy as np
from typing import Dict, Optional
import time
import yfinance as yf

try:
    from tvDatafeed import TvDatafeed, Interval
except ImportError:
    TvDatafeed = None
    Interval = None

# Configure request session to bypass blocks
session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
})

class StockAnalyzer:
    def __init__(self, config):
        self.config = config
        self.params = config.INDICATOR_PARAMS
        self.tv = None
        if TvDatafeed is not None:
            try:
                self.tv = TvDatafeed()
            except Exception as e:
                print(f"Warning: Failed to initialize TvDatafeed: {e}")

    def _fetch_alpha_vantage(self, symbol: str) -> Optional[pd.DataFrame]:
        """Fetches daily stock data using Alpha Vantage API."""
        api_key = os.environ.get("ALPHA_VANTAGE_API_KEY")
        if not api_key:
            return None

        url = f"https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol={symbol}&outputsize=compact&apikey={api_key}"
        try:
            resp = session.get(url, timeout=10)
            if resp.status_code != 200:
                print(f"[ALPHA VANTAGE] HTTP Error {resp.status_code} for {symbol}")
                return None

            data = resp.json()
            if "Note" in data or "Information" in data or "Error Message" in data:
                note = data.get("Note") or data.get("Information") or data.get("Error Message")
                print(f"[ALPHA VANTAGE LIMIT/NOTICE] {symbol}: {note}")
                return None

            time_series = data.get("Time Series (Daily)")
            if not time_series:
                return None

            df = pd.DataFrame.from_dict(time_series, orient='index')
            df = df.rename(columns={
                '1. open': 'Open',
                '2. high': 'High',
                '3. low': 'Low',
                '4. close': 'Close',
                '5. volume': 'Volume'
            })
            df.index = pd.to_datetime(df.index)
            df = df.sort_index()
            df = df[["Open", "High", "Low", "Close", "Volume"]].astype(float)
            if df.empty:
                return None
            return df
        except Exception as e:
            print(f"[ALPHA VANTAGE ERROR] {symbol}: {e}")
            return None

    def _fetch_yfinance(self, symbol: str) -> Optional[pd.DataFrame]:
        """Fetches historical stock data using yfinance."""
        try:
            ticker = yf.Ticker(symbol, session=session)
            df = ticker.history(period="1y")

            if df.empty:
                print(f"No data found for {symbol} via yfinance")
                return None

            # Select only the columns needed for technical indicators
            df = df[["Open", "High", "Low", "Close", "Volume"]]
            df = df.astype(float)

            return df

        except Exception as e:
            print(f"Error fetching data for {symbol} via yfinance: {e}")
            return None

    def fetch_data(self, symbol: str) -> Optional[pd.DataFrame]:
        """Fetches historical stock data using Alpha Vantage as primary source and yfinance as fallback."""
        # 1. Primary Attempt: Alpha Vantage API
        df_av = self._fetch_alpha_vantage(symbol)
        if df_av is not None and not df_av.empty:
            print(f"[PRIMARY - Alpha Vantage] Successfully fetched data for {symbol}")
            self.consecutive_yfinance_failures = 0
            return df_av

        # 2. Fallback: yfinance with Cooldown / Backoff
        if hasattr(self, 'consecutive_yfinance_failures') and self.consecutive_yfinance_failures > 2:
            cooldown = min(10.0, 1.5 * self.consecutive_yfinance_failures)
            print(f"[COOLDOWN] Applying {cooldown:.1f}s backoff delay before yfinance fallback for {symbol}...")
            time.sleep(cooldown)

        is_github_actions = os.environ.get('GITHUB_ACTIONS') == 'true'

        if symbol.endswith(".CA") and not is_github_actions:
            if self.tv is None:
                print(f"Warning: TvDatafeed not initialized. Falling back to yfinance for {symbol}")
                res = self._fetch_yfinance(symbol)
            else:
                try:
                    core_symbol = symbol.split(".")[0]
                    df = self.tv.get_hist(
                        symbol=core_symbol,
                        exchange='EGX',
                        interval=Interval.in_daily,
                        n_bars=250
                    )
                    if df is None or df.empty:
                        res = self._fetch_yfinance(symbol)
                    else:
                        df = df.rename(columns={
                            'open': 'Open',
                            'high': 'High',
                            'low': 'Low',
                            'close': 'Close',
                            'volume': 'Volume'
                        })
                        res = df[["Open", "High", "Low", "Close", "Volume"]].astype(float)
                except Exception as e:
                    print(f"Warning: Error fetching EGX data from TradingView for {symbol}: {e}. Falling back to yfinance.")
                    res = self._fetch_yfinance(symbol)
        else:
            res = self._fetch_yfinance(symbol)

        if res is None or res.empty:
            self.consecutive_yfinance_failures = getattr(self, 'consecutive_yfinance_failures', 0) + 1
        else:
            self.consecutive_yfinance_failures = 0

        return res

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

        # EMA 50
        if len(df) >= 50:
            df['EMA_50'] = ta.trend.EMAIndicator(
                df['Close'], window=50
            ).ema_indicator()
        else:
            df['EMA_50'] = None
            print(f"[WARNING] Not enough data to calculate EMA_50 (length: {len(df)})")

        # EMA 200
        if len(df) >= 200:
            df['EMA_200'] = ta.trend.EMAIndicator(
                df['Close'], window=200
            ).ema_indicator()
        else:
            df['EMA_200'] = None
            print(f"[WARNING] Not enough data to calculate EMA_200 (length: {len(df)})")

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

        # ATR (14)
        atr_ind = ta.volatility.AverageTrueRange(
            high=df['High'], low=df['Low'], close=df['Close'], window=14
        )
        df['ATR_14'] = atr_ind.average_true_range()

        # Weekly Resampling for Weekly Trend Filter
        try:
            df_weekly = df[['Open', 'High', 'Low', 'Close', 'Volume']].resample('W-FRI').agg({
                'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last', 'Volume': 'sum'
            }).dropna()
            if len(df_weekly) >= 50:
                w_ema20 = ta.trend.EMAIndicator(df_weekly['Close'], window=20).ema_indicator().iloc[-1]
                w_ema50 = ta.trend.EMAIndicator(df_weekly['Close'], window=50).ema_indicator().iloc[-1]
                w_close = df_weekly['Close'].iloc[-1]
                df['Weekly_EMA20'] = w_ema20
                df['Weekly_EMA50'] = w_ema50
                df['Weekly_Close'] = w_close
            else:
                df['Weekly_EMA20'] = None
                df['Weekly_EMA50'] = None
                df['Weekly_Close'] = None
        except Exception as e:
            print(f"[WARNING] Weekly indicator calculation error: {e}")
            df['Weekly_EMA20'] = None
            df['Weekly_EMA50'] = None
            df['Weekly_Close'] = None

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
            'stoch_rsi_d': latest['StochRSI_D'],
            'atr': latest['ATR_14'],
            'weekly_ema_20': latest.get('Weekly_EMA20'),
            'weekly_ema_50': latest.get('Weekly_EMA50'),
            'weekly_close': latest.get('Weekly_Close')
        }

        for k, v in data.items():
            if isinstance(v, (int, float)) and pd.notna(v):
                data[k] = round(v, 4) if v < 100 else round(v, 2)
            else:
                data[k] = None

        return data

    def is_in_weekly_downtrend(self, data: Dict) -> bool:
        """
        Binary complementary weekly trend filter:
        Returns True (downtrend -> reject) IF AND ONLY IF BOTH:
        - weekly_close < weekly_ema_50
        - weekly_ema_20 < weekly_ema_50
        Otherwise returns False (accept).
        This guarantees 100% mutual exclusivity with zero gap.
        """
        w_close = data.get('weekly_close')
        w_ema20 = data.get('weekly_ema_20')
        w_ema50 = data.get('weekly_ema_50')

        if w_close is None or w_ema20 is None or w_ema50 is None:
            return False

        import pandas as pd
        if pd.isna(w_close) or pd.isna(w_ema20) or pd.isna(w_ema50):
            return False

        return bool(w_close < w_ema50 and w_ema20 < w_ema50)

    def calculate_trading_levels(self, stock_data: Dict) -> Dict[str, float]:
        """
        Pure Python calculation of trading levels (Entry, Stop Loss, Take Profit)
        based on technical indicators (Close, Support, Resistance, ATR).
        """
        close = float(stock_data.get('close', 0) or 0)
        atr = float(stock_data.get('atr', 0) or 0)
        support = float(stock_data.get('support', 0) or 0)
        resistance = float(stock_data.get('resistance', 0) or 0)

        # Fallback values if ATR missing
        if atr <= 0:
            atr = close * 0.02

        decimals = 4 if close < 10 else 2

        # 1. Entry Price: simulate limit order entry on minor pullback (0.5 * ATR or 1.5% below close)
        pullback_offset = min(0.015 * close, 0.5 * atr)
        entry_price = round(close - pullback_offset, decimals)

        # 2. Stop Loss: below support or 1.5 * ATR below entry
        if support > 0 and support < entry_price and (entry_price - support) <= (3.0 * atr):
            stop_loss = round(support - (0.25 * atr), decimals)
        else:
            stop_loss = round(entry_price - (1.5 * atr), decimals)

        # Ensure stop_loss is below entry
        if stop_loss >= entry_price:
            stop_loss = round(entry_price * 0.96, decimals)

        # 3. Take Profit: 1.8x RRR target, strictly capped below resistance with a buffer
        risk = entry_price - stop_loss
        target_rr = entry_price + (risk * 1.8)

        if resistance > 0 and resistance > entry_price:
            res_buffer = min(0.005 * close, 0.25 * atr)
            capped_resistance = resistance - res_buffer
            if capped_resistance > entry_price:
                take_profit = round(min(target_rr, capped_resistance), decimals)
            else:
                take_profit = round(target_rr, decimals)
        else:
            take_profit = round(target_rr, decimals)

        return {
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "take_profit": take_profit
        }

    def validate_trading_levels(self, entry: float, sl: float, tp: float, resistance: float = 0) -> tuple:
        """
        Validates mathematical integrity of trading levels:
        1. sl < entry < tp
        2. Actual Risk-Reward Ratio (based on final take_profit) >= 1.5
        3. Take profit strictly does not breach 30-day resistance
        """
        if not (sl < entry < tp):
            return False, f"Invalid order logic: SL ({sl}) < Entry ({entry}) < TP ({tp}) failed"

        risk = entry - sl
        reward = tp - entry

        if risk <= 0:
            return False, f"Risk ({risk}) is non-positive"

        rr_ratio = reward / risk
        if rr_ratio < 1.5:
            return False, f"Actual Risk-Reward ratio {rr_ratio:.2f} (TP: {tp}, Entry: {entry}) is below minimum required 1.50"

        if resistance > 0:
            if resistance <= entry:
                return False, f"Entry ({entry}) is at or above 30-day resistance ({resistance})"
            if tp > resistance:
                return False, f"Take profit ({tp}) breaches 30-day resistance level ({resistance})"

        return True, "Valid"

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

        if close is None or ema_50 is None or ema_200 is None:
            return False  # If data missing, don't skip
            
        import pandas as pd
        if pd.isna(close) or pd.isna(ema_50) or pd.isna(ema_200):
            return False

        return close < ema_50 and ema_50 < ema_200

    def analyze_stock(self, symbol: str) -> Optional[Dict]:
        """Full pipeline for a single stock."""
        df = self.fetch_data(symbol)
        if df is None:
            raise ValueError(f"Failed to fetch data for {symbol}")

        df = self.calculate_indicators(df)
        latest_data = self.get_latest_data(df)
        latest_data['symbol'] = symbol

        # Macro trend filter
        if self.is_in_macro_downtrend(latest_data):
            print(f"Skipped {symbol}: In a macro downtrend (price < EMA50 < EMA200)")
            return None

        return latest_data
