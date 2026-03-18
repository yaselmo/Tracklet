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

Push-Location $Root
try {
    & $Python -m invoke worker
}
finally {
    Pop-Location
}
