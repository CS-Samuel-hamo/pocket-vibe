param(
    [string]$BackendWsUrl = "ws://127.0.0.1:8000/ws",
    [string]$Token = "vibe-safe",
    [string]$HostId = "native-probe-1",
    [string]$Label = "Native App Probe",
    [string]$Platform = "native-app-probe",
    [string]$ProjectRoot = ".",
    [string]$PythonExecutable = "python",
    [switch]$PrintOnly
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$probePath = Join-Path $PSScriptRoot "host_probe.py"
if (-not (Test-Path $probePath)) {
    throw "Cannot find host_probe.py at $probePath"
}

$resolvedProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $ProjectRoot))
$arguments = @(
    $probePath,
    "--backend-ws-url", $BackendWsUrl,
    "--token", $Token,
    "--host-id", $HostId,
    "--label", $Label,
    "--platform", $Platform,
    "--project-root", $resolvedProjectRoot
)

Write-Host "Pocket Vibe host probe" -ForegroundColor Cyan
Write-Host "Backend WS : $BackendWsUrl" -ForegroundColor Gray
Write-Host "Host       : $Label ($HostId)" -ForegroundColor Gray
Write-Host "Platform   : $Platform" -ForegroundColor Gray
Write-Host "Project    : $resolvedProjectRoot" -ForegroundColor Gray
Write-Host ""

if ($PrintOnly) {
    $quotedArgs = $arguments | ForEach-Object {
        if ($_ -match '\s') { '"' + $_.Replace('"', '\"') + '"' } else { $_ }
    }
    Write-Host "Command" -ForegroundColor Yellow
    Write-Host "$PythonExecutable $($quotedArgs -join ' ')"
    exit 0
}

Write-Host "Starting read-only desktop-host probe. Press Ctrl+C to stop." -ForegroundColor Yellow
& $PythonExecutable @arguments
exit $LASTEXITCODE
