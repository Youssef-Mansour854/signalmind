import pandas as pd
import ta
import numpy as np
from typing import Dict, Optional

class SwingAnalyzer:
    """
    Quantitative analyzer for Weekly & Long-Term Swing Trading setups.
    Performs weekly resampling ('W-FRI'), 6-month support/resistance calculation,
    and quantitative level generation/validation.
    """
    def __init__(self, config=None):
        self.config = config

    def calculate_weekly_indicators(self, df_daily: pd.DataFrame) -> pd.DataFrame:
        """
        Resamples daily stock data into weekly Friday bars ('W-FRI')
        and calculates weekly indicators (RSI-14, MACD, SMA20/50/200, ATR-14, 6M Sup/Res).
        """
        if df_daily is None or len(df_daily) < 30:
            return pd.DataFrame()

        # Resample daily OHLCV to Weekly (Friday anchor)
        df_weekly = df_daily[['Open', 'High', 'Low', 'Close', 'Volume']].resample('W-FRI').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last',
            'Volume': 'sum'
        }).dropna()

        if len(df_weekly) < 14:
            return pd.DataFrame()

        # Weekly RSI (14)
        df_weekly['RSI_14'] = ta.momentum.RSIIndicator(
            df_weekly['Close'], window=14
        ).rsi()

        # Weekly MACD (12, 26, 9)
        macd = ta.trend.MACD(
            df_weekly['Close'], window_slow=26, window_fast=12, window_sign=9
        )
        df_weekly['MACD_Line'] = macd.macd()
        df_weekly['MACD_Signal'] = macd.macd_signal()
        df_weekly['MACD_Hist'] = macd.macd_diff()

        # Weekly Moving Averages
        df_weekly['SMA_20'] = ta.trend.SMAIndicator(df_weekly['Close'], window=20).sma_indicator()
        df_weekly['SMA_50'] = ta.trend.SMAIndicator(df_weekly['Close'], window=50).sma_indicator() if len(df_weekly) >= 50 else None
        df_weekly['SMA_200'] = ta.trend.SMAIndicator(df_weekly['Close'], window=200).sma_indicator() if len(df_weekly) >= 200 else None

        # Weekly ATR (14)
        atr_ind = ta.volatility.AverageTrueRange(
            high=df_weekly['High'], low=df_weekly['Low'], close=df_weekly['Close'], window=14
        )
        df_weekly['ATR_14'] = atr_ind.average_true_range()

        # 6-Month (26 Weekly Bars) Support and Resistance
        last_26_weeks = df_weekly.tail(26)
        df_weekly['Support_6M'] = last_26_weeks['Low'].min()
        df_weekly['Resistance_6M'] = last_26_weeks['High'].max()

        return df_weekly

    def get_latest_swing_data(self, df_daily: pd.DataFrame, symbol: str) -> Optional[Dict]:
        """
        Calculates weekly indicators and returns latest weekly metrics dictionary.
        """
        df_weekly = self.calculate_weekly_indicators(df_daily)
        if df_weekly.empty:
            return None

        latest = df_weekly.iloc[-1]
        close = float(latest['Close'])

        data = {
            'symbol': symbol,
            'close': close,
            'weekly_volume': float(latest['Volume']),
            'weekly_rsi': float(latest['RSI_14']) if pd.notna(latest['RSI_14']) else 50.0,
            'weekly_macd_line': float(latest['MACD_Line']) if pd.notna(latest['MACD_Line']) else 0.0,
            'weekly_macd_signal': float(latest['MACD_Signal']) if pd.notna(latest['MACD_Signal']) else 0.0,
            'weekly_macd_hist': float(latest['MACD_Hist']) if pd.notna(latest['MACD_Hist']) else 0.0,
            'weekly_sma_20': float(latest['SMA_20']) if pd.notna(latest.get('SMA_20')) else None,
            'weekly_sma_50': float(latest['SMA_50']) if pd.notna(latest.get('SMA_50')) else None,
            'weekly_sma_200': float(latest['SMA_200']) if pd.notna(latest.get('SMA_200')) else None,
            'weekly_atr': float(latest['ATR_14']) if pd.notna(latest['ATR_14']) else round(close * 0.03, 4),
            'support_6m': float(latest['Support_6M']),
            'resistance_6m': float(latest['Resistance_6M'])
        }

        # Calculate trading levels
        levels = self.calculate_swing_levels(data)
        data.update(levels)

        return data

    def calculate_swing_levels(self, stock_data: Dict) -> Dict[str, float]:
        """
        100% Pure Python quantitative level calculation for Swing Trading setups
        using Weekly ATR and 6-month Support/Resistance bounds.
        """
        close = float(stock_data.get('close', 0) or 0)
        atr = float(stock_data.get('weekly_atr', 0) or 0)
        support = float(stock_data.get('support_6m', 0) or 0)
        resistance = float(stock_data.get('resistance_6m', 0) or 0)

        if atr <= 0:
            atr = close * 0.03

        decimals = 4 if close < 10 else 2

        # 1. Entry Price: Current weekly close or minor pullback entry
        entry_price = round(close, decimals)

        # 2. Stop Loss: Below 6M support or 2.0 * Weekly ATR below entry
        if support > 0 and support < entry_price and (entry_price - support) <= (4.0 * atr):
            stop_loss = round(support - (0.3 * atr), decimals)
        else:
            stop_loss = round(entry_price - (2.0 * atr), decimals)

        if stop_loss >= entry_price:
            stop_loss = round(entry_price * 0.92, decimals)

        # 3. Take Profit: 2.2x RRR target, strictly capped near 6M resistance with a buffer
        risk = entry_price - stop_loss
        target_rr = entry_price + (risk * 2.2)

        if resistance > 0 and resistance > entry_price:
            res_buffer = min(0.01 * close, 0.3 * atr)
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

    def validate_swing_levels(self, entry: float, sl: float, tp: float, resistance: float = 0) -> tuple:
        """
        Validates mathematical integrity of swing trading levels:
        1. sl < entry < tp
        2. Actual Risk-Reward Ratio >= 1.50
        3. Take profit strictly capped at or below 6M resistance level
        """
        if not (sl < entry < tp):
            return False, f"Invalid order logic: SL ({sl}) < Entry ({entry}) < TP ({tp}) failed"

        risk = entry - sl
        reward = tp - entry

        if risk <= 0:
            return False, f"Risk ({risk}) is non-positive"

        rr_ratio = reward / risk
        if rr_ratio < 1.50:
            return False, f"Actual Risk-Reward ratio {rr_ratio:.2f} (TP: {tp}, Entry: {entry}) is below minimum required 1.50"

        if resistance > 0:
            if resistance <= entry:
                return False, f"Entry ({entry}) is at or above 6M resistance ({resistance})"
            if tp > resistance:
                return False, f"Take profit ({tp}) breaches 6M resistance level ({resistance})"

        return True, "Valid"
