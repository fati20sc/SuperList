@echo off
REM ======================================================================
REM  CONFIGURAR-NOTIFICACIONES.cmd
REM
REM  Doble clic en este archivo y seguí los pasos.
REM
REM  Que hace, en orden:
REM    1) Abre el navegador para autorizar a Supabase.
REM    2) Corre la migracion y guarda la clave de servicio en el vault.
REM    3) Despliega la Edge Function send-push.
REM    4) Guarda los secretos de las notificaciones.
REM
REM  Es seguro correrlo mas de una vez.
REM ======================================================================

cd /d "%~dp0"

echo.
echo ==============================================
echo   SuperList - configuracion de notificaciones
echo ==============================================
echo.
echo Se va a abrir el navegador para que autorices a
echo Supabase. Cliquea "Authorize" y volvi a esta
echo ventana.
echo.

call npx supabase login

if errorlevel 1 (
    echo.
    echo No se pudo autorizar. Volve a intentarlo.
    pause
    exit /b 1
)

echo.
echo Autorizado. Configurando las notificaciones...
echo.

node tools\setup-notificaciones.mjs

echo.
if errorlevel 1 (
    echo Hubo un problema. Lo de mas arriba explica cual.
) else (
    echo TODO LISTO. Las notificaciones ya estan configuradas.
)
echo.
pause
