@echo off
:: scriptorium-open.cmd — Windows launcher (the counterpart of scriptorium-open.sh).
::   * no argument  : opens scriptorium.html as a Chromium app window (cache-busted).
::   * a .md file   : hands that file to the running page via the helper's control channel
::                    (open_tab), opening a window first if none is listening. This is what makes
::                    double-clicking a .md actually LOAD it, instead of showing the last-open tab.
::   Also starts tools\search-helper.py on :9194 if it isn't already answering (search + control).
:: Optional env: SCRIPTORIUM_PYTHON=<path to python.exe>   (use where "python" is the Store alias)
::               SCRIPTORIUM_HTML=<path to scriptorium.html> (default: the one next to this script's parent)
setlocal EnableDelayedExpansion
set "ROOT=%~dp0.."
:: per-machine settings (git-ignored), e.g.  set "SCRIPTORIUM_PYTHON=C:\path\to\python.exe"
if exist "%~dp0scriptorium-open.local.cmd" call "%~dp0scriptorium-open.local.cmd"
if "%SCRIPTORIUM_HTML%"=="" (set "HTML=%ROOT%\scriptorium.html") else (set "HTML=%SCRIPTORIUM_HTML%")
if not exist "%HTML%" (echo not found: %HTML% & pause & exit /b 1)

:: --- python (helper + the .md sender) ----------------------------------------
set "PY=%SCRIPTORIUM_PYTHON%"
if "%PY%"=="" (where py >nul 2>&1 && set "PY=py -3")
if "%PY%"=="" set "PY=python"

:: --- 1. helper (search + control mailbox) ------------------------------------
curl -s -m 2 http://127.0.0.1:9194/health >nul 2>&1
if errorlevel 1 (
  start "Scriptorium helper" /min cmd /c ""%PY%" "%ROOT%\tools\search-helper.py""
)

:: --- 2. a .md was double-clicked? deliver it to the page ----------------------
set "MDFILE=%~1"
if not "%MDFILE%"=="" if exist "%MDFILE%" (
  rem first try an already-open window (no new window, no duplicate)
  "%PY%" "%ROOT%\tools\scriptorium-send.py" --if-open "%MDFILE%"
  if not errorlevel 1 goto :done
  rem none listening: open a window, then deliver (the sender waits for it to connect)
  call :launchapp
  "%PY%" "%ROOT%\tools\scriptorium-send.py" "%MDFILE%"
  goto :done
)

:: --- no file: just open the app window ----------------------------------------
call :launchapp
goto :done

:launchapp
:: cache-busting version = file mtime, so a rebuilt file is never served stale from file:// cache
for /f %%v in ('powershell -NoProfile -Command "(Get-Item -LiteralPath '%HTML%').LastWriteTime.ToFileTimeUtc()"') do set "V=%%v"
set "P=%HTML:\=/%"
set "URL=file:///%P%?v=%V%"
set "BROWSER="
for %%B in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if "!BROWSER!"=="" if exist %%B set "BROWSER=%%~B"
)
if "%BROWSER%"=="" (start "" "%URL%") else (start "" "%BROWSER%" --app="%URL%")
exit /b

:done
endlocal
