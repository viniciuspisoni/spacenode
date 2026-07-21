@echo off
rem Go-live do Stripe sem terminal: clique duplo aqui.
rem O script pede a chave live num prompt oculto (cole com Ctrl+V ou botao
rem direito e aperte Enter) e faz o resto sozinho. Nada de chave em arquivo.
setlocal
cd /d "%~dp0.."
node scripts\stripe-live-setup.mjs
echo.
pause
