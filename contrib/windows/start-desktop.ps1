param(
    [string]$Address = "127.0.0.1:8000",
    [switch]$NoWorker
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$PowerShell = (Get-Command powershell.exe).Source

function Start-TrackletWindow {
    param(
        [string]$Title,
        [string]$ScriptPath,
        [string[]]$Arguments = @()
    )

    $argList = @(
        "-NoProfile",
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "& '$ScriptPath' $($Arguments -join ' ')"
    )

    Start-Process -FilePath $PowerShell -WorkingDirectory $Root -ArgumentList $argList -WindowStyle Normal | Out-Null
    Write-Host "Started $Title"
}

$BackendScript = Join-Path $PSScriptRoot "start-backend.ps1"
$WorkerScript = Join-Path $PSScriptRoot "start-worker.ps1"
$FrontendScript = Join-Path $PSScriptRoot "start-frontend.ps1"
$ElectronScript = Join-Path $PSScriptRoot "start-electron.ps1"
$ApiUrl = "http://127.0.0.1:5173"

Start-TrackletWindow -Title "backend" -ScriptPath $BackendScript -Arguments @("-Address", $Address)

if (-not $NoWorker) {
    Start-TrackletWindow -Title "worker" -ScriptPath $WorkerScript
}

Start-TrackletWindow -Title "frontend" -ScriptPath $FrontendScript
Start-TrackletWindow -Title "electron" -ScriptPath $ElectronScript -Arguments @("-RendererUrl", "http://127.0.0.1:5173/web/", "-ApiUrl", $ApiUrl)

Write-Host "Tracklet desktop launch requested."
Write-Host "Backend URL: http://$Address"
Write-Host "Electron API URL: $ApiUrl"
