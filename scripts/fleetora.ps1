param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop')]
    [string] $Action,
    [switch] $Neon,
    [switch] $Rebuild
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host 'Docker Desktop is required. Install it, start it, and try again.'
    exit 1
}
# Windows PowerShell treats native stderr as errors; retain the exit status here.
$ErrorActionPreference = 'Continue'
& docker info *> $null
$dockerStatus = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($dockerStatus -ne 0) {
    Write-Host 'Docker Desktop is not running or is unavailable. Start Docker Desktop, wait until its engine is ready, and try again.'
    exit 1
}
if (-not (Test-Path -LiteralPath '.env' -PathType Leaf)) {
    Write-Host 'Missing root .env. Copy .env.example to .env and set the required secrets first.'
    exit 1
}
if ($Neon -and -not (Test-Path -LiteralPath 'backend/.env' -PathType Leaf)) {
    Write-Host 'Neon mode requires DATABASE_URL in backend/.env.'
    exit 1
}

$composeFiles = @('-f', 'docker-compose.yml')
if ($Neon) { $composeFiles += @('-f', 'docker-compose.neon.yml') }

# Resolve privately so redaction uses Docker's exact values (including quoted env
# files and interpolation). Never print or write the resolved configuration.
$ErrorActionPreference = 'Continue'
$configurationJson = & docker compose @composeFiles config --format json 2>$null
$configurationStatus = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($configurationStatus -ne 0) {
    Write-Host 'Compose configuration is invalid. Check the required values in .env and, for Neon, backend/.env.'
    exit 1
}
try { $configuration = ($configurationJson -join "`n") | ConvertFrom-Json } catch {
    Write-Host 'Could not read the Compose configuration safely.'
    exit 1
}
if ($Neon -and [string]::IsNullOrWhiteSpace($configuration.services.backend.environment.DATABASE_URL)) {
    Write-Host 'Neon mode requires a nonempty DATABASE_URL in backend/.env.'
    exit 1
}

# Docker publishes IPv4 only. A localhost activation link can otherwise open a
# separate IPv6 dev stack. Override only the local development origin, privately
# for this launcher process; public HTTPS and other ports remain configured.
if ($Action -eq 'start' -and $configuration.services.backend.environment.NODE_ENV -ne 'production') {
    $activationUri = $null
    if ([uri]::TryCreate($configuration.services.backend.environment.FRONTEND_URL, [System.UriKind]::Absolute, [ref] $activationUri) -and
        $activationUri.Scheme -eq 'http' -and $activationUri.Port -eq 3000 -and
        $activationUri.Host -in @('localhost', '127.0.0.1', '::1', '[::1]', '[0000:0000:0000:0000:0000:0000:0000:0001]') -and
        -not $activationUri.UserInfo -and -not $activationUri.Query -and -not $activationUri.Fragment -and
        $activationUri.AbsolutePath -eq '/') {
        $env:FRONTEND_URL = 'http://127.0.0.1:3000'
    }
}

# Never echo environment values, including when showing application diagnostics.
$secretValues = @(
    foreach ($service in $configuration.services.PSObject.Properties.Value) {
        foreach ($item in $service.environment.PSObject.Properties) {
            if ($item.Name -match '(?i)PASSWORD|SECRET|TOKEN|DATABASE_URL|MAIL_USER|KEY' -and $item.Value) {
                [string] $item.Value
                if ($item.Name -eq 'DATABASE_URL') {
                    $databaseUri = $null
                    if ([uri]::TryCreate($item.Value, [System.UriKind]::Absolute, [ref] $databaseUri)) {
                        foreach ($credential in ($databaseUri.UserInfo -split ':', 2)) {
                            if ($credential) { [uri]::UnescapeDataString($credential) }
                        }
                    }
                }
            }
        }
    }
    foreach ($item in Get-ChildItem Env:) {
        if ($item.Name -match '(?i)PASSWORD|SECRET|TOKEN|DATABASE_URL|MAIL_USER|KEY' -and $item.Value) {
            $item.Value
        }
    }
) | Sort-Object -Property Length -Descending | Select-Object -Unique

function Protect-FleetoraOutput([string] $Line) {
    $safe = $Line -replace '(?i)postgres(?:ql)?://[^\s"''<>]+', '[REDACTED_URL]'
    foreach ($secret in $secretValues) { $safe = $safe.Replace($secret, '[REDACTED]') }
    return $safe
}

function Invoke-FleetoraCompose([string[]] $ComposeArguments) {
    $ErrorActionPreference = 'Continue'
    & docker compose @composeFiles @ComposeArguments 2>&1 | ForEach-Object {
        Write-Host (Protect-FleetoraOutput $_.ToString())
    }
    return $LASTEXITCODE
}

if ($Action -eq 'stop') {
    # No --volumes: local PostgreSQL data remains available on the next start.
    $status = Invoke-FleetoraCompose -ComposeArguments @('down')
    exit $status
}

$upArguments = @('up', '-d')
if ($Rebuild) { $upArguments += '--build' }
if ($Neon) {
    $upArguments += @('backend', 'frontend')
    Write-Host 'Starting Fleetora with Neon (backend and frontend only; no migrations).'
} else {
    Write-Host 'Starting Fleetora locally (PostgreSQL, migrations, backend and frontend).'
}
$status = Invoke-FleetoraCompose -ComposeArguments $upArguments
if ($status -ne 0) {
    Write-Host 'Fleetora could not start. Recent backend and frontend logs:'
    $null = Invoke-FleetoraCompose -ComposeArguments @('logs', '--no-color', '--tail', '30', 'backend', 'frontend')
    exit $status
}

# Compose publishes IPv4 loopback. Open that exact endpoint: localhost may resolve
# to a separate IPv6 development server even after the Docker probe succeeds.
$url = 'http://127.0.0.1:3000'
$probeUrl = $url
$clock = [System.Diagnostics.Stopwatch]::StartNew()
Write-Host "Waiting up to 180 seconds for $url" -NoNewline
while ($clock.Elapsed.TotalSeconds -lt 180) {
    $attemptStart = $clock.Elapsed.TotalMilliseconds
    $ready = $false
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $probeUrl -TimeoutSec 2
        $ready = $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    } catch {
        # A connection refusal or an unfinished startup is retried until the deadline.
    }
    if ($ready) {
        Write-Host "`nFleetora is ready: $url"
        Start-Process -FilePath $url
        exit 0
    }
    Write-Host '.' -NoNewline
    $pause = [Math]::Min(2000 - ($clock.Elapsed.TotalMilliseconds - $attemptStart), 180000 - $clock.Elapsed.TotalMilliseconds)
    if ($pause -gt 0) { Start-Sleep -Milliseconds ([int] $pause) }
}
Write-Host "`nFleetora did not respond within 180 seconds. Last 30 lines per service:"
$null = Invoke-FleetoraCompose -ComposeArguments @('logs', '--no-color', '--tail', '30', 'backend', 'frontend')
exit 1
