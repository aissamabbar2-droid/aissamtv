@echo off
rem Open TV - serves the app on the local network so a phone on the same Wi-Fi can open it
cd /d "%~dp0"
where python >/dev/null 2>/dev/null || (echo Python is required: https://www.python.org/downloads/ & pause & exit /b)
python server.py
pause
