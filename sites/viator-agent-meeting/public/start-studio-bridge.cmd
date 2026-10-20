@echo off
cd /d "%~dp0"
set FOUND=0
for %%F in (viator-studio-*.private.json) do (
  set FOUND=1
  start "VIATOR Studio Bridge %%F" /b node studio-bridge.mjs "%%F"
)
if "%FOUND%"=="0" echo viator-studio-프로젝트.private.json 파일이 필요합니다.
pause
