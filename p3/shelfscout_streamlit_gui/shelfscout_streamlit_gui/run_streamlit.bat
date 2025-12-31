@echo off
setlocal
cd /d %~dp0

REM If you use a venv, activate it before running streamlit:
REM call ..\shelfscout_backend\venv\Scripts\activate.bat

streamlit run app.py --server.port 8501 --server.address 127.0.0.1
pause
