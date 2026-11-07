@echo off
rem Open TV - opens the app in its own window (Edge or Chrome app mode)
setlocal
set "APP=%~dp0index.html"
set "URL=file:///%APP:\=/%"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%EDGE%" (start "" "%EDGE%" --app="%URL%" --start-maximized & exit /b)
if exist "%CHROME%" (start "" "%CHROME%" --app="%URL%" --start-maximized & exit /b)
start "" "%APP%"
