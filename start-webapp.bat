@echo off
setlocal

REM =============================================================
REM Startscript voor de webapp (met duidelijke foutmeldingen)
REM Dit script:
REM 1) Controleert of Node.js en npm zijn geïnstalleerd
REM 2) Gaat naar de map /webapp
REM 3) Installeert afhankelijkheden (npm install)
REM 4) Start de ontwikkelserver (npm run dev)
REM =============================================================

REM Bewaar de map waar dit script staat (ook als er spaties in pad staan).
set "ROOT_DIR=%~dp0"
set "WEBAPP_DIR=%ROOT_DIR%webapp"

REM -------- Stap 1: Controleer Node.js --------
where node >nul 2>&1
if errorlevel 1 (
  echo [FOUT] Node.js is niet gevonden op deze computer.
  echo        Installeer eerst Node.js LTS via: https://nodejs.org/
  echo        Start daarna dit script opnieuw.
  goto :end_with_pause
)

REM -------- Stap 2: Controleer npm --------
where npm >nul 2>&1
if errorlevel 1 (
  echo [FOUT] npm is niet gevonden op deze computer.
  echo        Installeer Node.js LTS via: https://nodejs.org/
  echo        npm wordt normaal automatisch mee geinstalleerd.
  goto :end_with_pause
)

REM -------- Stap 3: Controleer of de webapp-map bestaat --------
if not exist "%WEBAPP_DIR%\package.json" (
  echo [FOUT] Kon package.json niet vinden in:
  echo        "%WEBAPP_DIR%"
  echo        Controleer of de mapstructuur klopt.
  goto :end_with_pause
)

REM Ga naar de webapp-map.
cd /d "%WEBAPP_DIR%"

REM -------- Stap 4: Installeer dependencies --------
echo.
echo [INFO] Dependencies installeren/updaten met npm install...
call npm install
if errorlevel 1 (
  echo.
  echo [FOUT] npm install is mislukt.
  echo        Meest voorkomende oorzaak: een dependency-versie bestaat niet meer.
  echo        Controleer package.json, vooral @react-three/drei.
  echo        Tip: probeer in deze map:
  echo             npm view @react-three/drei versions --json
  goto :end_with_pause
)

REM -------- Stap 5: Start de development server --------
echo.
echo [INFO] Webapp starten met npm run dev...
call npm run dev
if errorlevel 1 (
  echo.
  echo [FOUT] npm run dev is mislukt.
  echo        Controleer de foutmelding hierboven.
  goto :end_with_pause
)

goto :eof

:end_with_pause
echo.
pause
