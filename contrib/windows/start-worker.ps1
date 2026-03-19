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
    & $Python -m invoke worker
}
finally {
    Pop-Location
}
