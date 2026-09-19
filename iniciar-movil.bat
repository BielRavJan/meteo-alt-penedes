@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
  exit /b
)
cd /d "%~dp0"
netsh advfirewall firewall show rule name="Meteo Alt Penedes" >nul 2>&1 || netsh advfirewall firewall add rule name="Meteo Alt Penedes" dir=in action=allow protocol=TCP localport=8080 profile=private
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" -Lan
pause
