@echo off
:: scriptorium-open.cmd — Windows launcher (the counterpart of scriptorium-open.sh).
::   1. starts tools\search-helper.py in the background if it isn't already answering on :9194
::      (gives the assistant web_search/read_url and enables the remote-control channel)
::   2. opens scriptorium.html as a Chromium app window with a cache-busting ?v=<mtime>
::      so a rebuilt file is never served stale from the file:// cache.
:: Optional env: SCRIPTORIUM_PYTHON=<path to python.exe>   (use this where "python" is the Store alias)
::               SCRIPTORIUM_HTML=<path to scriptorium.html> (default: the one next to this script's parent)
setlocal EnableDelayedExpansion
set "ROOT=%~dp0.."
if "%SCRIPTORIUM_HTML%"=="" (set "HTML=%ROOT%\scriptorium.html") else (set "HTML=%SCRIPTORIUM_HTML%")
if not exist "%HTML%" (echo not found: %HTML% & pause & exit /b 1)

:: --- 1. helper ---------------------------------------------------------------
set "PY=%SCRIPTORIUM_PYTHON%"
if "%PY%"=="" (where py >nul 2>&1 && set "PY=py -3")
if "%PY%"=="" set "PY=python"
curl -s -m 2 http://127.0.0.1:9194/health >nul 2>&1
if errorlevel 1 (
  start "Scriptorium helper" /min cmd /c ""%PY%" "%ROOT%\tools\search-helper.py""
)

:: --- 2. cache-busting version = file mtime -----------------------------------
for /f %%v in ('powershell -NoProfile -Command "(Get-Item -LiteralPath '%HTML%').LastWriteTime.ToFileTimeUtc()"') do set "V=%%v"
set "P=%HTML:\=/%"
set "URL=file:///%P%?v=%V%"

:: --- 3. open as an app window (Chrome, Edge, or the default browser) ---------
set "BROWSER="
for %%B in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if "!BROWSER!"=="" if exist %%B set "BROWSER=%%~B"
)
if "%BROWSER%"=="" (start "" "%URL%") else (start "" "%BROWSER%" --app="%URL%")
endlocal
