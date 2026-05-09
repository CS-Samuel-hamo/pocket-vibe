param(
    [string]$TargetDir = ".",
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [switch]$Dev
)

$ErrorActionPreference = "Stop"

Write-Host "Pocket Vibe startup" -ForegroundColor Cyan
Write-Host "Target directory: $TargetDir" -ForegroundColor Gray

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$env:PYTHONPATH = "."
$env:TARGET_DIR = $TargetDir
$env:PORT = "$BackendPort"

if ($Dev) {
    $env:SERVE_FRONTEND_FROM_BACKEND = "0"
    Write-Host "[1/2] Starting frontend dev server..." -ForegroundColor Green
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location '$root\\frontend'; npm run dev -- --host 0.0.0.0 --port $FrontendPort"
    ) -WindowStyle Minimized
} else {
    $env:SERVE_FRONTEND_FROM_BACKEND = "1"
    $env:VITE_PWA_BASE = "/app/"
    Write-Host "[1/2] Building mobile PWA for backend hosting..." -ForegroundColor Green
    Push-Location "$root\\frontend"
    try {
        npm run build
    } finally {
        Pop-Location
    }
}

Write-Host "[2/2] Starting backend..." -ForegroundColor Green
if ($Dev) {
    Write-Host "Developer mode: the phone link will point to the Vite dev server." -ForegroundColor Yellow
} else {
    Write-Host "Product mode: the phone link will point to the backend-hosted PWA under /app/." -ForegroundColor Yellow
}
Write-Host "A desktop Pairing Page will open automatically. Configure the VS Code extension with the same backend token." -ForegroundColor Yellow

python backend/main.py
