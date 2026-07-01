@echo off
cd /d "%~dp0"
call venv\Scripts\activate
python src/main.py > logs_main.txt 2>&1
