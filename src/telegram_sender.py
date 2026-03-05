import requests
import datetime
from typing import Dict, Any

class TelegramSender:
    def __init__(self, config):
        self.config = config
        self.bot_token = config.TELEGRAM_BOT_TOKEN
        self.chat_id = config.TELEGRAM_CHAT_ID
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"

    def format_message(self, stock_data: Dict[str, Any], analysis: Dict[str, Any]) -> str:
        """Formats the analysis into the required Telegram message layout."""
        symbol = stock_data['symbol']
        
        # Determine risk icon
        risk = analysis.get('risk', 'Medium')
        risk_icon = "⚠️" if risk == 'High' else "📉" if risk == 'Low' else "⚖️"
        
        # Calculate current Cairo time (UTC+2)
        # For simplicity without pytz, we'll use UTC+2 directly
        cairo_time = datetime.datetime.utcnow() + datetime.timedelta(hours=2)
        time_str = cairo_time.strftime("%Y-%m-%d %H:%M:%S")

        message = f"""---
📊 {symbol} ({symbol})
{analysis.get('signal_formatted')}
💪 Confidence: {analysis.get('confidence')}
{risk_icon} Risk: {risk}

💰 Entry: ${analysis.get('entry_price')}
🛡️ Stop Loss: ${analysis.get('stop_loss')}  
🎯 Take Profit: ${analysis.get('take_profit')}

📝 {analysis.get('explanation_arabic')}

⏰ {time_str}

{self.config.DISCLAIMER_TEXT}
---"""
        return message

    def send_message(self, text: str) -> bool:
        """Sends a text message to the configured Telegram chat."""
        try:
            payload = {
                "chat_id": self.chat_id,
                "text": text,
                "parse_mode": "HTML" # allow basic formatting if needed
            }
            response = requests.post(self.base_url, json=payload)
            response.raise_for_status()
            return True
        except Exception as e:
            print(f"Error sending Telegram message: {e}")
            return False

    def send_error_alert(self, total: int, failed: int) -> bool:
        """Sends an alert if failure threshold is reached."""
        text = f"🚨 <b>SignalMind Alert</b> 🚨\nMore than 50% of stocks failed processing today.\nTotal: {total}, Failed: {failed}"
        return self.send_message(text)
