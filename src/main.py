import config
from stock_analyzer import StockAnalyzer
from claude_analyst import ClaudeAnalyst
from telegram_sender import TelegramSender
import time
import sys

def main():
    try:
        config.validate_config()
    except ValueError as e:
        print(f"Configuration error: {e}")
        sys.exit(1)

    print("Starting abstract stock analysis process...")

    # Initialize components
    analyzer = StockAnalyzer(config)
    claude = ClaudeAnalyst(config)
    telegram = TelegramSender(config)

    all_stocks = config.US_STOCKS + config.EGX_STOCKS
    total_stocks = len(all_stocks)
    failed_stocks = 0

    print(f"Planning to analyze {total_stocks} stocks.")

    for i, symbol in enumerate(all_stocks):
        print(f"[{i+1}/{total_stocks}] Analyzing {symbol}...")
        try:
            # 1. Fetch & Analyze Data
            stock_data = analyzer.analyze_stock(symbol)
            if not stock_data:
                print(f"Failed to fetch or analyze data for {symbol}.")
                failed_stocks += 1
                continue

            # 2. Get AI Analysis
            time.sleep(config.API_DELAY_SECONDS) # Protect Claude rate limits
            analysis = claude.analyze(stock_data)
            if not analysis:
                print(f"Failed to get AI analysis for {symbol}.")
                failed_stocks += 1
                continue

            # 3. Format & Send Message
            message = telegram.format_message(stock_data, analysis)
            success = telegram.send_message(message)
            
            if not success:
                print(f"Failed to send Telegram message for {symbol}.")
                failed_stocks += 1
            else:
                print(f"Successfully processed and sent signal for {symbol}.")
                
        except Exception as e:
            print(f"Unexpected error processing {symbol}: {e}")
            failed_stocks += 1

    # Check failure threshold
    if total_stocks > 0 and (failed_stocks / total_stocks) > 0.5:
        print("More than 50% of stocks failed. Sending error alert.")
        telegram.send_error_alert(total_stocks, failed_stocks)

    print(f"Finished processing. Successful: {total_stocks - failed_stocks}, Failed: {failed_stocks}")

if __name__ == "__main__":
    main()
