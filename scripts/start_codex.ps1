$override = $env:POCKET_VIBE_CODEX_PATH
if ($override -and (Test-Path $override)) {
    & $override @args
    exit $LASTEXITCODE
}

$extensionRoot = Join-Path $env:USERPROFILE '.antigravity\extensions'
if (Test-Path $extensionRoot) {
    $candidate = Get-ChildItem -Path $extensionRoot -Directory |
        Where-Object { $_.Name -like 'openai.chatgpt-*' } |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'bin\windows-x86_64\codex.exe' } |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1

    if ($candidate) {
        & $candidate @args
        exit $LASTEXITCODE
    }
}

Write-Error 'Pocket Vibe could not find a working codex.exe. Set POCKET_VIBE_CODEX_PATH or install the OpenAI ChatGPT extension bundle.'
exit 1
