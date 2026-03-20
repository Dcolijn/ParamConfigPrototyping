@echo off
setlocal

REM =============================================================
REM build-webapp.bat
REM Maakt een productie-build via npm run build.
REM =============================================================

set "ROOT_DIR=%~dp0"
set "WEBAPP_DIR=%ROOT_DIR%webapp"

REM -------- Controle 1: Node.js aanwezig? --------
where node >nul 2>&1
if errorlevel 1 (
  echo [FOUT] Node.js is niet gevonden op deze computer.
  echo        Installeer Node.js LTS via: https://nodejs.org/
  goto :end_with_pause
)

REM -------- Controle 2: npm aanwezig? --------
where npm >nul 2>&1
if errorlevel 1 (
  echo [FOUT] npm is niet gevonden op deze computer.
  echo        Installeer Node.js LTS via: https://nodejs.org/
  goto :end_with_pause
)

REM -------- Controle 3: webapp map aanwezig? --------
if not exist "%WEBAPP_DIR%\" (
  echo [FOUT] De map "webapp" ontbreekt.
  echo        Verwacht pad: "%WEBAPP_DIR%"
  goto :end_with_pause
)

if not exist "%WEBAPP_DIR%\package.json" (
  echo [FOUT] package.json ontbreekt in:
  echo        "%WEBAPP_DIR%"
  goto :end_with_pause
)

cd /d "%WEBAPP_DIR%"

echo.
echo [INFO] Build starten met: npm run build
call npm run build
if errorlevel 1 (
  echo.
  echo [FOUT] npm run build is mislukt.
  echo        Controleer de foutmelding hierboven.
  goto :end_with_pause
)

echo.
echo [KLAAR] Build geslaagd.
goto :end_with_pause

:end_with_pause
echo.
pause
