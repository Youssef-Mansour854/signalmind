import requests
import datetime
import html
import time
from typing import Dict, Any
import zoneinfo

cairo_tz = zoneinfo.ZoneInfo("Africa/Cairo")

class TelegramSender:
    def __init__(self, config):
        self.config = config
        self.bot_token = config.TELEGRAM_BOT_TOKEN
        self.chat_id = config.TELEGRAM_CHAT_ID
        if self.bot_token and self.chat_id:
            self.base_url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        else:
            self.base_url = None

    def has_credentials(self) -> bool:
        return bool(self.bot_token and self.chat_id and self.base_url)

    def format_message(self, stock_data: Dict[str, Any], analysis: Dict[str, Any]) -> str:
        """Formats the analysis into the required Telegram message layout with HTML escaping."""
        symbol = html.escape(str(stock_data.get('symbol', '')))
        signal_fmt = html.escape(str(analysis.get('signal_formatted', '')))
        confidence = html.escape(str(analysis.get('confidence', '')))
        risk = html.escape(str(analysis.get('risk', '')))
        entry = html.escape(str(analysis.get('entry_price', '')))
        sl = html.escape(str(analysis.get('stop_loss', '')))
        tp = html.escape(str(analysis.get('take_profit', '')))
        explanation = html.escape(str(analysis.get('explanation_arabic', '')))
        disclaimer = html.escape(str(self.config.DISCLAIMER_TEXT))

        risk_icon = "⚠️" if analysis.get('risk') == 'High' else "📉" if analysis.get('risk') == 'Low' else "⚖️"
        
        cairo_time = datetime.datetime.now(cairo_tz)
        time_str = cairo_time.strftime("%Y-%m-%d %H:%M:%S")

        message = f"""---
📊 <b>{symbol}</b>
{signal_fmt}
💪 Confidence: {confidence}
{risk_icon} Risk: {risk}

💰 Entry: ${entry}
🛡️ Stop Loss: ${sl}  
🎯 Take Profit: ${tp}

📝 {explanation}

⏰ {time_str}

{disclaimer}
---"""
        return message

    def send_message(self, text: str) -> bool:
        """Sends a text message to the configured Telegram chat with retry logic and 400 error handling."""
        if not self.has_credentials():
            print("[INFO] Telegram credentials not found. Skipping Telegram alert. Signals will only be saved to MongoDB.")
            return True

        max_retries = 3
        for attempt in range(max_retries + 1):
            try:
                payload = {
                    "chat_id": self.chat_id,
                    "text": text,
                    "parse_mode": "HTML"
                }
                response = requests.post(self.base_url, json=payload, timeout=10)
                
                # Bad Request (400) is usually HTML parse error - log raw text and skip retry
                if response.status_code == 400:
                    print(f"[TELEGRAM ERROR 400] HTML parse error from Telegram. Skipping retries.\nRaw Message:\n{text}\nTelegram Response: {response.text}")
                    return False

                response.raise_for_status()
                return True
            except requests.exceptions.RequestException as e:
                status_code = getattr(getattr(e, 'response', None), 'status_code', None)
                if status_code == 400:
                    print(f"[TELEGRAM ERROR 400] Bad Request / HTML parse error. Skipping retries.\nRaw Message:\n{text}\nDetails: {e}")
                    return False

                if attempt < max_retries:
                    backoff = 2 * (2 ** attempt)  # 2s, 4s, 8s
                    print(f"[TELEGRAM RETRY] Request failed ({e}). Retrying in {backoff}s (Attempt {attempt + 1}/{max_retries})...")
                    time.sleep(backoff)
                else:
                    print(f"[TELEGRAM ERROR] Failed after {max_retries} retries: {e}")
                    return False
            except Exception as e:
                print(f"Error sending Telegram message: {e}")
                return False

        return False

    def send_summary(self, total: int, buy_count: int, buy_symbols: list) -> bool:
        """Sends a final summary report to Telegram."""
        if not self.has_credentials():
            print("[INFO] Telegram credentials not found. Skipping daily Telegram summary.")
            return True

        cairo_time = datetime.datetime.now(cairo_tz)
        date_str = cairo_time.strftime("%Y-%m-%d")
        escaped_symbols = [html.escape(str(s)) for s in buy_symbols]
        symbols_str = ", ".join(escaped_symbols) if escaped_symbols else "None"
        
        text = f"""---
📊 <b>SignalMind Daily Summary</b>
🗓 {date_str}
✅ Analyzed: {total} stocks
🟢 BUY Signals: {buy_count}
📋 Opportunities: {symbols_str}
---"""
        return self.send_message(text)

    def send_top_signals_aggregated(self, top_signals: list) -> bool:
        """Aggregates Top 5 signals into ONE single formatted Telegram message per run."""
        if not self.has_credentials():
            print("[INFO] Telegram credentials not found. Skipping aggregated Telegram alert.")
            return True

        if not top_signals:
            return True

        cairo_time = datetime.datetime.now(cairo_tz)
        time_str = cairo_time.strftime("%Y-%m-%d %H:%M")

        lines = [
            "🏆 <b>SignalMind Top 5 Quantitative Opportunities</b> 🚀",
            f"⏰ <i>{time_str}</i> (Cairo Time)",
            "----------------------------------------"
        ]

        for idx, sig in enumerate(top_signals, 1):
            symbol = html.escape(str(sig.get('symbol', 'UNKNOWN')))
            market = html.escape(str(sig.get('market', 'US')))
            signal_type = html.escape(str(sig.get('signalType', 'BUY')))
            entry = html.escape(str(sig.get('entryPrice', 0)))
            tp = html.escape(str(sig.get('takeProfit', 0)))
            sl = html.escape(str(sig.get('stopLoss', 0)))
            score = html.escape(str(sig.get('scoreMetrics', {}).get('totalScore', 0)))
            timeframe = html.escape(str(sig.get('timeframe', 'يومي')))
            curr = "ج.م" if sig.get('market') == "EGX" or str(sig.get('symbol', '')).endswith(".CA") else "$"

            lines.append(
                f"<b>#{idx} {symbol}</b> ({market}) - 🟢 <b>{signal_type}</b>\n"
                f"📈 <b>Score:</b> {score}/100 | ⏱ <b>Timeframe:</b> {timeframe}\n"
                f"💰 <b>Entry:</b> {curr}{entry} | 🎯 <b>TP:</b> {curr}{tp} | 🛡️ <b>SL:</b> {curr}{sl}\n"
            )

        lines.append("----------------------------------------")
        lines.append(html.escape(str(self.config.DISCLAIMER_TEXT)))

        full_message = "\n".join(lines)
        return self.send_message(full_message)

    def send_error_alert(self, total: int, failed: int, details: str = "") -> bool:
        """Sends an alert if failure threshold is reached."""
        if not self.has_credentials():
            print("[INFO] Telegram credentials not found. Skipping error alert.")
            return True

        escaped_total = html.escape(str(total))
        escaped_failed = html.escape(str(failed))
        details_part = f"\nDetails: {html.escape(str(details))}" if details else ""

        text = f"🚨 <b>SignalMind Alert</b> 🚨\nMore than 50% of stocks failed processing today.\nTotal: {escaped_total}, Failed: {escaped_failed}{details_part}"
        return self.send_message(text)
