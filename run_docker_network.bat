@echo off
echo ===================================================
echo   GeM Scraper Dashboard - Docker Network Launcher
echo ===================================================
echo.
docker-compose up -d --build
echo.
echo Containers built and started successfully!
echo Dashboard UI is live at:
echo   http://127.0.0.1:6012  (Next.js Dashboard)
echo Backend API is live at:
echo   http://127.0.0.1:6001  (Flask API ^& Auto-Scheduler)
echo.
pause
