param(
    [string]$Address = "127.0.0.1:8000",
    [switch]$ForceMigrate
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$PythonCandidates = @(
    (Join-Path $Root "env\\Scripts\\python.exe"),
    (Join-Path (Split-Path $Root -Parent) "env\\Scripts\\python.exe")
)
$Python = $PythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Python) {
    throw "Python virtual environment not found in expected locations: $($PythonCandidates -join ', ')"
}

if (-not $env:INVENTREE_DESKTOP_MODE) {
    $env:INVENTREE_DESKTOP_MODE = "1"
}

$env:INVENTREE_DEBUG = "0"

if (-not $env:INVENTREE_DESKTOP_DATA_DIR) {
    $desktopRoot = if ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA "TrackletDesktop"
    } elseif ($env:APPDATA) {
        Join-Path $env:APPDATA "TrackletDesktop"
    } else {
        Join-Path $Root "runtime-data"
    }

    $env:INVENTREE_DESKTOP_DATA_DIR = $desktopRoot
}

Push-Location $Root
try {
    if ($env:INVENTREE_DESKTOP_MODE -eq "1") {
        $stateDir = Join-Path $env:INVENTREE_DESKTOP_DATA_DIR "state"
        $migrationStamp = Join-Path $stateDir "last-migrate-check.txt"
        $migrationFiles = Get-ChildItem -Path (Join-Path $Root "src\backend\Tracklet") -Recurse -File -Filter "*.py" |
            Where-Object { $_.FullName -match "\\migrations\\" }
        $latestMigration = $migrationFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
        $stampIsCurrent = $false

        if ((-not $ForceMigrate) -and (Test-Path $migrationStamp) -and $latestMigration) {
            $stamp = Get-Item $migrationStamp
            $stampIsCurrent = $stamp.LastWriteTimeUtc -ge $latestMigration.LastWriteTimeUtc
        }

        if ($ForceMigrate -or (-not $stampIsCurrent)) {
            Write-Host "Applying Tracklet database migrations for desktop data..."
            & $Python -m invoke migrate

            if ($LASTEXITCODE -ne 0) {
                exit $LASTEXITCODE
            }

            New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
            Set-Content -Path $migrationStamp -Value (Get-Date).ToUniversalTime().ToString("o")
        }
        else {
            Write-Host "Tracklet database migrations are already up to date. Use -ForceMigrate to run them again."
        }
    }

    & $Python "$Root\src\backend\Tracklet\manage.py" runserver $Address --noreload
}
finally {
    Pop-Location
}
