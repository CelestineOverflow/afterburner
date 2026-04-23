@echo off
setlocal

pushd "%~dp0"

echo Building node sidecar...
call npm run build
if errorlevel 1 goto :fail

for /f "delims=" %%i in ('rustc --print host-tuple') do set TRIPLE=%%i

if not exist "..\src-tauri\binaries" mkdir "..\src-tauri\binaries"

move /y ".\dist\sidecar-server.exe" "..\src-tauri\binaries\sidecar-server-%TRIPLE%.exe"
if errorlevel 1 goto :fail

echo Done: sidecar-server-%TRIPLE%.exe
popd
exit /b 0

:fail
echo BUILD FAILED
popd
exit /b 1