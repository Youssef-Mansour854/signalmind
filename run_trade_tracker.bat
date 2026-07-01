@echo off
cd /d "%~dp0"
call venv\Scripts\activate
python src/trade_tracker.py >> logs_tracker.txt 2>&1
