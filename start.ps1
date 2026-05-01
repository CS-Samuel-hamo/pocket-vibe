param(
    [string]$TargetDir = ".",
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"

Write-Host "Pocket Vibe v1 startup" -ForegroundColor Cyan
Write-Host "Target directory: $TargetDir" -ForegroundColor Gray

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$env:PYTHONPATH = "."
$env:TARGET_DIR = $TargetDir
$env:PORT = "$BackendPort"

Write-Host "[1/2] Starting frontend dev server..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$root\\frontend'; npm run dev -- --host 0.0.0.0 --port $FrontendPort"
) -WindowStyle Minimized

Write-Host "[2/2] Starting backend..." -ForegroundColor Green
Write-Host "A desktop Pairing Page will open automatically." -ForegroundColor Yellow
Write-Host "If it does not open, copy the printed Pairing Page URL into your desktop browser." -ForegroundColor Yellow
Write-Host "Then configure the VS Code extension with the same backend token." -ForegroundColor Yellow

python backend/main.py
