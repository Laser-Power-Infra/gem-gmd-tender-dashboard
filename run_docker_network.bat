@echo off
echo ===================================================
echo   GeM Scraper Dashboard - Docker Network Launcher
echo ===================================================
echo.
docker-compose up -d --build
echo.
echo Container started successfully!
echo Dashboard is live on your network:
echo   http://127.0.0.1:6001
echo.
pause
