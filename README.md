# SignalMind: AI-Powered Stock Signals

An automated system that analyzes stocks (EGX and US markets) and sends AI-generated trading signals daily via Telegram — fully automated with no manual intervention.

## Tech Stack

- **GitHub Actions**: Daily scheduling
- **Python**: Data fetching and analysis
- **yfinance** & **pandas-ta**: Financial data and technical indicators
- **Google Gemini API (gemini-1.5-flash)**: AI analysis and signal generation
- **Telegram Bot API**: Alert delivery

## Daily Schedule

Runs automatically every weekday (Monday-Friday) at **8:00 AM Cairo Time (UTC+2)** via GitHub Actions.

---

## 🚀 Setup & Deployment Guide

### 1. Telegram Bot Setup

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow the prompts to create your bot.
3. Save the **Bot Token** provided by BotFather.
4. Send a message to your new bot.
5. Go to `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates` to find your `chat_id` (look inside the JSON response for `"chat":{"id":...}`).

### 2. Google Gemini API Key

1. Go to Google AI Studio to get your Gemini API key.

### 3. GitHub Repository Configuration

1. Fork or push this repository to your GitHub account.
2. Go to **Settings > Secrets and variables > Actions**.
3. Create the following **New repository secrets**:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `TELEGRAM_BOT_TOKEN`: Your Telegram Bot Token.
   - `TELEGRAM_CHAT_ID`: Your Telegram Chat ID.

GitHub Actions will now automatically run the script every weekday at 8:00 AM Cairo time.

---

## 💻 Local Development & Testing

1. **Clone the repository:**

   ```bash
   git clone <your-repo-url>
   cd signalmind
   ```

2. **Create a virtual environment (optional but recommended):**

   ```bash
   python -m venv venv
   # On Windows
   venv\Scripts\activate
   # On macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables:**
   Create a `.env` file in the root directory (or simply copy/rename `.env.example` if available) and add:

   ```env
   GEMINI_API_KEY=your_key_here
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```

5. **Run the script manually:**
   ```bash
   python src/main.py
   ```

## ⚙️ Configuration

You can easily add or remove stocks by editing `src/config.py`:

- `US_STOCKS`: List of US tickers (e.g., `["AAPL", "TSLA"]`).
- `EGX_STOCKS`: List of Egyptian tickers (e.g., `["COMI.CA", "EKHO.CA"]`). Supported by Yahoo Finance via the `.CA` suffix.

Disclaimer: All generated signals are for educational purposes only.
