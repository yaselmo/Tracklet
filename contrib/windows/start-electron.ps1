param(
    [string]$RendererUrl = "http://127.0.0.1:5173/web/",
    [string]$ApiUrl = "http://127.0.0.1:5173"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$Electron = Join-Path $Root "electron"

Push-Location $Electron
try {
    $env:ELECTRON_RENDERER_URL = $RendererUrl
    $env:ELECTRON_API_URL = $ApiUrl
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

    npm run dev
}
finally {
    Pop-Location
}
