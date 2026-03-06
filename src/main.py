import config
from stock_analyzer import StockAnalyzer
from claude_analyst import GeminiAnalyst
from telegram_sender import TelegramSender
import sys
import random

def main():
    try:
        config.validate_config()
    except ValueError as e:
        print(f"Configuration error: {e}")
        sys.exit(1)

    print("Starting SignalMind stock analysis process...")

    analyzer = StockAnalyzer(config)
    gemini = GeminiAnalyst(config)
    telegram = TelegramSender(config)

    all_stocks = config.US_STOCKS + config.EGX_STOCKS
    if len(all_stocks) > 25:
        all_stocks = random.sample(all_stocks, 25)

    total_stocks = len(all_stocks)
    failed_stocks = 0
    buy_signals = 0
    buy_symbols = []

    print(f"Planning to analyze {total_stocks} stocks.")

    for i, symbol in enumerate(all_stocks):
        print(f"[{i+1}/{total_stocks}] Analyzing {symbol}...")
        try:
            # 1. Fetch & Analyze Data
            stock_data = analyzer.analyze_stock(symbol)
            if not stock_data:
                print(f"Failed to fetch or analyze data for {symbol}.")
                failed_stocks += 1
                # Wait before next Alpha Vantage request (max 25 req/day, 1 req/sec)
                time.sleep(15)
                continue

            # 2. Wait between Alpha Vantage requests
            time.sleep(15)

            # 3. Get AI Analysis
            time.sleep(config.API_DELAY_SECONDS)
            analysis = gemini.analyze(stock_data)
            if not analysis:
                print(f"Failed to get AI analysis for {symbol}.")
                failed_stocks += 1
                continue

            # 4. Format & Send Message ONLY IF BUY
            if analysis.get('signal') == 'BUY':
                buy_signals += 1
                buy_symbols.append(symbol)
                message = telegram.format_message(stock_data, analysis)
                success = telegram.send_message(message)

                if not success:
                    print(f"Failed to send Telegram message for {symbol}.")
                    failed_stocks += 1
                else:
                    print(f"Successfully processed and sent BUY signal for {symbol}.")
            else:
                print(f"Signal for {symbol} is {analysis.get('signal')}, skipping Telegram message.")

        except Exception as e:
            print(f"Unexpected error processing {symbol}: {e}")
            failed_stocks += 1

    if total_stocks > 0:
        telegram.send_summary(total_stocks, buy_signals, buy_symbols)

    if total_stocks > 0 and (failed_stocks / total_stocks) > 0.5:
        print("More than 50% of stocks failed. Sending error alert.")
        telegram.send_error_alert(total_stocks, failed_stocks)

    print(f"Finished. Successful: {total_stocks - failed_stocks}, Failed: {failed_stocks}")

if __name__ == "__main__":
    main()
