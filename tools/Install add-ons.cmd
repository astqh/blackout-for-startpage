@echo off
rem Opens the install page from this downloaded folder on http://localhost:8777/ (this PC only). Close this window when done.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
