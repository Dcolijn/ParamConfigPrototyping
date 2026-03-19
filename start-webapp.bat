@echo off
setlocal

REM Bewaar de map waar dit script staat (werkt ook als pad spaties bevat).
set "ROOT_DIR=%~dp0"

REM Ga naar de webapp map met quotes rond het pad.
cd /d "%ROOT_DIR%webapp"

REM Installeer dependencies alleen de eerste keer (als node_modules nog niet bestaat).
if not exist "node_modules" (
  echo Eerste keer opstarten: npm install wordt uitgevoerd...
  call npm install
)

REM Start de Vite development server.
call npm run dev

REM Houd het venster open zodat je foutmeldingen kunt lezen.
pause
