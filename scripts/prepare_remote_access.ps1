param(
    [ValidateSet("tailscale", "cloudflare", "custom")]
    [string]$Provider = "custom",
    [string]$AccessHost = "",
    [int]$FrontendPort = 5173,
    [int]$BackendPort = 8000,
    [string]$FrontendUrl = "",
    [string]$ApiBaseUrl = "",
    [string]$BackendWsUrl = "",
    [string]$Token = "",
    [string]$EnvPath = "",
    [switch]$WriteEnv
)

$ErrorActionPreference = "Stop"

function Normalize-HttpUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $trimmed = $Value.Trim()
    if (-not $trimmed) {
        throw "HTTP URL cannot be empty."
    }

    if ($trimmed -notmatch '^[a-z]+://') {
        $trimmed = "https://$trimmed"
    }

    $uri = [System.Uri]$trimmed
    if ($uri.Scheme -notin @('http', 'https')) {
        throw "HTTP URL must start with http:// or https://."
    }

    return $trimmed.TrimEnd('/')
}

function Normalize-WsUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $trimmed = $Value.Trim()
    if (-not $trimmed) {
        throw "WebSocket URL cannot be empty."
    }

    if ($trimmed -notmatch '^[a-z]+://') {
        $trimmed = "wss://$trimmed"
    }

    $uri = [System.Uri]$trimmed
    switch ($uri.Scheme) {
        'http' { $scheme = 'ws' }
        'https' { $scheme = 'wss' }
        'ws' { $scheme = 'ws' }
        'wss' { $scheme = 'wss' }
        default { throw "WebSocket URL must start with ws://, wss://, http://, or https://." }
    }

    $builder = [System.UriBuilder]$trimmed
    $builder.Scheme = $scheme
    if ($scheme -eq 'ws' -and $builder.Port -eq 443) {
        $builder.Port = -1
    }
    if ($scheme -eq 'wss' -and $builder.Port -eq 80) {
        $builder.Port = -1
    }
    if ([string]::IsNullOrWhiteSpace($builder.Path) -or $builder.Path -eq '/') {
        $builder.Path = '/ws'
    }

    return $builder.Uri.ToString().TrimEnd('/')
}

function Build-EnvSnippet {
    param(
        [string]$ResolvedFrontendUrl,
        [string]$ResolvedApiBaseUrl,
        [string]$ResolvedBackendWsUrl,
        [string]$ResolvedToken
    )

    $lines = @(
        "PUBLIC_FRONTEND_URL=$ResolvedFrontendUrl",
        "PUBLIC_API_BASE_URL=$ResolvedApiBaseUrl",
        "PUBLIC_BACKEND_WS_URL=$ResolvedBackendWsUrl"
    )

    if ($ResolvedToken) {
        $lines += "POCKET_VIBE_TOKEN=$ResolvedToken"
    }

    return ($lines -join [Environment]::NewLine)
}

$resolvedFrontendUrl = $FrontendUrl.Trim()
$resolvedApiBaseUrl = $ApiBaseUrl.Trim()
$resolvedBackendWsUrl = $BackendWsUrl.Trim()

switch ($Provider) {
    "tailscale" {
        if (-not $AccessHost.Trim()) {
            throw "Tailscale mode requires -AccessHost, for example 100.88.12.34 or your-machine.tailnet.ts.net."
        }

        $resolvedFrontendUrl = if ($resolvedFrontendUrl) { $resolvedFrontendUrl } else { "http://$($AccessHost.Trim()):$FrontendPort" }
        $resolvedApiBaseUrl = if ($resolvedApiBaseUrl) { $resolvedApiBaseUrl } else { "http://$($AccessHost.Trim()):$BackendPort" }
        $resolvedBackendWsUrl = if ($resolvedBackendWsUrl) { $resolvedBackendWsUrl } else { "ws://$($AccessHost.Trim()):$BackendPort/ws" }
    }
    "cloudflare" {
        if (-not $resolvedFrontendUrl) {
            throw "Cloudflare mode requires -FrontendUrl because the phone must load the frontend page from a public URL."
        }
        if (-not $resolvedApiBaseUrl -and -not $resolvedBackendWsUrl) {
            throw "Cloudflare mode requires -ApiBaseUrl or -BackendWsUrl."
        }
    }
    "custom" {
        if (-not $resolvedFrontendUrl -and $AccessHost.Trim()) {
            $resolvedFrontendUrl = "https://$($AccessHost.Trim())"
        }
        if (-not $resolvedApiBaseUrl -and $AccessHost.Trim()) {
            $resolvedApiBaseUrl = "https://$($AccessHost.Trim())"
        }
    }
}

if (-not $resolvedFrontendUrl) {
    throw "Frontend URL is required. Provide -FrontendUrl, or use -Provider tailscale -AccessHost <address>."
}

if (-not $resolvedApiBaseUrl -and -not $resolvedBackendWsUrl) {
    throw "Provide -ApiBaseUrl or -BackendWsUrl."
}

$resolvedFrontendUrl = Normalize-HttpUrl -Value $resolvedFrontendUrl

if ($resolvedApiBaseUrl) {
    $resolvedApiBaseUrl = Normalize-HttpUrl -Value $resolvedApiBaseUrl
}

if (-not $resolvedBackendWsUrl) {
    $derivedWsBase = if ($resolvedApiBaseUrl) { $resolvedApiBaseUrl } else { $resolvedFrontendUrl }
    $resolvedBackendWsUrl = Normalize-WsUrl -Value "$derivedWsBase/ws"
} else {
    $resolvedBackendWsUrl = Normalize-WsUrl -Value $resolvedBackendWsUrl
}

if (-not $resolvedApiBaseUrl) {
    $resolvedApiBaseUrl = Normalize-HttpUrl -Value $resolvedBackendWsUrl
    if ($resolvedApiBaseUrl.EndsWith('/ws')) {
        $resolvedApiBaseUrl = $resolvedApiBaseUrl.Substring(0, $resolvedApiBaseUrl.Length - 3)
    }
}

$envSnippet = Build-EnvSnippet `
    -ResolvedFrontendUrl $resolvedFrontendUrl `
    -ResolvedApiBaseUrl $resolvedApiBaseUrl `
    -ResolvedBackendWsUrl $resolvedBackendWsUrl `
    -ResolvedToken $Token.Trim()

Write-Host "Pocket Vibe remote access profile" -ForegroundColor Cyan
Write-Host "Provider: $Provider" -ForegroundColor Gray
Write-Host ""
Write-Host ".env snippet" -ForegroundColor Green
Write-Host "------------" -ForegroundColor Green
Write-Host $envSnippet
Write-Host ""
Write-Host "Phone manual connection fields" -ForegroundColor Yellow
Write-Host "------------------------------" -ForegroundColor Yellow
Write-Host "Session Token : $($Token.Trim())"
Write-Host "Backend WS    : $resolvedBackendWsUrl"
Write-Host "API Base      : $resolvedApiBaseUrl"
Write-Host "Frontend URL  : $resolvedFrontendUrl"

if ($WriteEnv) {
    $targetPath = if ($EnvPath.Trim()) { $EnvPath } else { Join-Path $PSScriptRoot "..\\.env.remote.local" }
    $resolvedTarget = [System.IO.Path]::GetFullPath($targetPath)
    [System.IO.File]::WriteAllText($resolvedTarget, $envSnippet + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
    Write-Host ""
    Write-Host "Wrote profile to $resolvedTarget" -ForegroundColor Green
}

Write-Host ""
Write-Host "Next steps" -ForegroundColor Cyan
Write-Host "1. Copy the snippet into .env, or use -WriteEnv and merge the generated file."
Write-Host "2. Restart .\\start.ps1 so the pairing page and mobile link use these public/VPN addresses."
Write-Host "3. On the phone, either open the new Mobile Link or use Link -> manual connection fields above."
