param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [switch]$SkipFrontendPort,
    [switch]$Json,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Checks = @()

function Add-Check {
    param(
        [string]$Name,
        [ValidateSet("pass", "warn", "fail")]
        [string]$Status,
        [string]$Detail,
        [string]$Action,
        [bool]$Required = $true
    )

    $script:Checks += [pscustomobject]@{
        name = $Name
        status = $Status
        required = $Required
        detail = $Detail
        action = $Action
    }
}

function Get-CommandText {
    param([string]$Command)

    $found = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $found) {
        return $null
    }

    return $found.Source
}

function Get-ToolVersion {
    param(
        [string]$Command,
        [string[]]$ArgumentList
    )

    try {
        return ((& $Command @ArgumentList 2>&1) | Select-Object -First 1).ToString()
    } catch {
        return $_.Exception.Message
    }
}

function Add-RequiredToolCheck {
    param(
        [string]$Name,
        [string]$Command,
        [string[]]$VersionArgs,
        [string]$Action
    )

    $source = Get-CommandText -Command $Command
    if (-not $source) {
        Add-Check $Name "fail" "$Command was not found on PATH." $Action $true
        return
    }

    $version = Get-ToolVersion -Command $Command -ArgumentList $VersionArgs
    Add-Check $Name "pass" "$version ($source)" "" $true
}

function Test-DirectoryPresent {
    param(
        [string]$Name,
        [string]$Path,
        [string]$Action
    )

    $resolved = Join-Path $Root $Path
    if (Test-Path $resolved) {
        Add-Check $Name "pass" $Path "" $true
        return
    }

    Add-Check $Name "fail" "$Path is missing." $Action $true
}

function Test-PortAvailable {
    param([int]$Port)

    try {
        $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return -not $listeners
    } catch {
        $matches = netstat -ano | Select-String -Pattern (":$Port\s")
        return -not $matches
    }
}

function Add-PortCheck {
    param(
        [string]$Name,
        [int]$Port,
        [string]$Action
    )

    if (Test-PortAvailable -Port $Port) {
        Add-Check $Name "pass" "Port $Port is available." "" $true
        return
    }

    Add-Check $Name "fail" "Port $Port is already in use." $Action $true
}

function Find-CodexCandidate {
    if ($env:POCKET_VIBE_CODEX_PATH -and (Test-Path $env:POCKET_VIBE_CODEX_PATH)) {
        return $env:POCKET_VIBE_CODEX_PATH
    }

    $command = Get-Command codex.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $extensionRoot = Join-Path $env:USERPROFILE ".antigravity\extensions"
    if (-not (Test-Path $extensionRoot)) {
        return $null
    }

    $candidate = Get-ChildItem -Path $extensionRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "openai.chatgpt-*" } |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "bin\windows-x86_64\codex.exe" } |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1

    return $candidate
}

function Write-HumanReport {
    $failures = @($Checks | Where-Object { $_.status -eq "fail" })
    $warnings = @($Checks | Where-Object { $_.status -eq "warn" })

    if ($Quiet -and -not $failures -and -not $warnings) {
        return
    }

    Write-Host "Pocket Vibe Windows prereq check" -ForegroundColor Cyan
    foreach ($check in $Checks) {
        $color = switch ($check.status) {
            "pass" { "Green" }
            "warn" { "Yellow" }
            default { "Red" }
        }
        Write-Host ("[{0}] {1}: {2}" -f $check.status.ToUpperInvariant(), $check.name, $check.detail) -ForegroundColor $color
        if ($check.action) {
            Write-Host ("      Action: {0}" -f $check.action) -ForegroundColor Gray
        }
    }
}

Add-RequiredToolCheck "Python" "python" @("--version") "Install Python 3.11+ and reopen PowerShell."
Add-RequiredToolCheck "Node.js" "node" @("--version") "Install Node.js LTS and reopen PowerShell."
Add-RequiredToolCheck "npm" "npm" @("--version") "Install Node.js LTS with npm."

Test-DirectoryPresent "Frontend dependencies" "frontend\node_modules" "Run: npm --prefix frontend install"
Test-DirectoryPresent "VS Code bridge dependencies" "vscode-bridge\node_modules" "Run: npm --prefix vscode-bridge install"
Test-DirectoryPresent "Backend app" "backend" "Run from the Pocket Vibe repository root."
Test-DirectoryPresent "Frontend app" "frontend" "Run from the Pocket Vibe repository root."
Test-DirectoryPresent "VS Code bridge" "vscode-bridge" "Run from the Pocket Vibe repository root."

Add-PortCheck "Backend port" $BackendPort "Close the existing process or start with -BackendPort <free-port>."
if (-not $SkipFrontendPort) {
    Add-PortCheck "Frontend dev port" $FrontendPort "Close the existing process or start dev mode with -FrontendPort <free-port>."
}

$code = Get-CommandText -Command "code"
if ($code) {
    Add-Check "VS Code CLI" "pass" $code "" $false
} else {
    Add-Check "VS Code CLI" "warn" "code was not found on PATH." "Install VS Code or add the code command to PATH before bridge setup." $false
}

$codex = Find-CodexCandidate
if ($codex) {
    Add-Check "Codex CLI" "pass" $codex "" $false
} else {
    Add-Check "Codex CLI" "warn" "codex.exe was not found." "Install Codex/OpenAI extension bundle or set POCKET_VIBE_CODEX_PATH." $false
}

$failed = @($Checks | Where-Object { $_.status -eq "fail" })
$summary = [pscustomobject]@{
    ok = ($failed.Count -eq 0)
    root = $Root.Path
    backend_port = $BackendPort
    frontend_port = if ($SkipFrontendPort) { $null } else { $FrontendPort }
    checks = $Checks
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 5
} else {
    Write-HumanReport
}

if ($failed.Count -gt 0) {
    exit 1
}
