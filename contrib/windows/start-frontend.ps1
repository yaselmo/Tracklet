$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$Frontend = Join-Path $Root "src\\frontend"

Push-Location $Frontend
try {
    npx --yes yarn@1.22.22 compile
    npx --yes yarn@1.22.22 dev --host 127.0.0.1 --port 5173 --strictPort
}
finally {
    Pop-Location
}
