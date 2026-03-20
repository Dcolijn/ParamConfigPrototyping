@echo off
setlocal

REM =============================================================
REM setup-webapp.bat
REM Eenmalige setup: installeert npm packages in /webapp.
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
echo [INFO] Packages installeren met: npm install
call npm install
if errorlevel 1 (
  echo.
  echo [FOUT] npm install is mislukt.
  echo        Controleer de foutmelding hierboven.
  goto :end_with_pause
)

echo.
echo [KLAAR] Setup voltooid. Je kunt nu start-webapp.bat starten.
goto :end_with_pause

:end_with_pause
echo.
pause
