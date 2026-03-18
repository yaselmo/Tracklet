param(
  [Parameter(Mandatory = $true)]
  [string]$BackendDir
)

$ErrorActionPreference = 'Stop'

function Resolve-ManagePyPath {
  param(
    [string]$BasePath
  )

  $candidates = @(
    (Join-Path $BasePath 'manage.py'),
    (Join-Path $BasePath 'src\backend\Tracklet\manage.py')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }

  return $null
}

function Resolve-PythonCommand {
  $pythonCommands = @(
    @('py', '-3'),
    @('python')
  )

  foreach ($command in $pythonCommands) {
    $binary = $command[0]

    try {
      $null = & $binary --version 2>$null
      if ($LASTEXITCODE -eq 0) {
        return $command
      }
    } catch {
    }
  }

  return $null
}

$managePy = Resolve-ManagePyPath -BasePath $BackendDir

if (-not $managePy) {
  Write-Host ''
  Write-Host 'Tracklet could not find manage.py in the selected folder.' -ForegroundColor Red
  Write-Host 'Choose either the project root or the backend folder that contains src\backend\Tracklet\manage.py.' -ForegroundColor Yellow
  Write-Host ''
  Read-Host 'Press Enter to close this window'
  exit 1
}

$pythonCommand = Resolve-PythonCommand

if (-not $pythonCommand) {
  Write-Host ''
  Write-Host 'Python was not found on this machine.' -ForegroundColor Red
  Write-Host 'Install Python or ensure py/python is available in PATH, then try again.' -ForegroundColor Yellow
  Write-Host ''
  Read-Host 'Press Enter to close this window'
  exit 1
}

$managePyDirectory = Split-Path $managePy -Parent

Write-Host ''
Write-Host 'Tracklet Desktop - Create Superuser' -ForegroundColor Green
Write-Host "Backend directory: $managePyDirectory"
Write-Host ''
Write-Host 'This helper runs Django createsuperuser against your existing Tracklet backend.' -ForegroundColor Cyan
Write-Host 'It does not install or bundle a backend automatically.' -ForegroundColor Cyan
Write-Host ''

Push-Location $managePyDirectory

try {
  $pythonArgs = @()

  if ($pythonCommand.Length -gt 1) {
    $pythonArgs = $pythonCommand[1..($pythonCommand.Length - 1)]
  }

  & $pythonCommand[0] @pythonArgs $managePy createsuperuser

  if ($LASTEXITCODE -eq 0) {
    Write-Host ''
    Write-Host 'Superuser creation finished successfully.' -ForegroundColor Green
  } else {
    Write-Host ''
    Write-Host "createsuperuser exited with code $LASTEXITCODE." -ForegroundColor Yellow
  }
} finally {
  Pop-Location
}

Write-Host ''
Read-Host 'Press Enter to close this window'
