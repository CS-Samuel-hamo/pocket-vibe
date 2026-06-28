param(
    [switch]$SkipBackendTests,
    [switch]$SkipFrontendTests,
    [switch]$SkipFrontendBuild,
    [switch]$SkipBridgeTests,
    [switch]$SkipQualityGate
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$StartedAt = Get-Date

function Invoke-GateStep {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Command
    Write-Host "PASS: $Name" -ForegroundColor Green
}

Push-Location $Root
try {
    $env:PYTHONPATH = "."

    if (-not $SkipBackendTests) {
        Invoke-GateStep "Backend tests" {
            python -m pytest tests -q
        }
    }

    if (-not $SkipFrontendTests) {
        Invoke-GateStep "Frontend capability tests" {
            Push-Location frontend
            try {
                npm run test:capabilities
            } finally {
                Pop-Location
            }
        }
    }

    if (-not $SkipFrontendBuild) {
        Invoke-GateStep "Frontend production build" {
            Push-Location frontend
            try {
                npm run build
            } finally {
                Pop-Location
            }
        }
    }

    if (-not $SkipBridgeTests) {
        Invoke-GateStep "VS Code bridge runtime tests" {
            Push-Location vscode-bridge
            try {
                npm run test:runtime
            } finally {
                Pop-Location
            }
        }
    }

    if (-not $SkipQualityGate) {
        Invoke-GateStep "Quality gate" {
            $files = git -c core.quotePath=false ls-files | Where-Object { $_ -match '\.(py|js|jsx|ts|tsx)$' }
            python scripts\quality_gate.py $files
        }
    }

    $Elapsed = (Get-Date) - $StartedAt
    Write-Host ""
    Write-Host ("Desktop gate passed in {0:mm\:ss}." -f $Elapsed) -ForegroundColor Green
    Write-Host "Next: run docs/v1_acceptance_script.md on a real phone." -ForegroundColor Yellow
} finally {
    Pop-Location
}
