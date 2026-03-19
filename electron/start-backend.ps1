param(
  [Parameter(Mandatory = $true)]
  [string]$BackendDir,
  [string]$Address = '127.0.0.1:8000'
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

function Resolve-ProjectRoot {
  param(
    [string]$ManagePyPath
  )

  $backendDir = Split-Path $ManagePyPath -Parent
  $normalized = $ManagePyPath.Replace('/', '\').ToLowerInvariant()

  if ($normalized.EndsWith('src\backend\tracklet\manage.py')) {
    return (Resolve-Path (Join-Path $backendDir '..\..\..')).Path
  }

  return $backendDir
}

function Write-Step {
  param(
    [string]$Message
  )

  Write-Output "[$((Get-Date).ToString('s'))] $Message"
}

$managePy = Resolve-ManagePyPath -BasePath $BackendDir

if (-not $managePy) {
  throw "Tracklet backend was not found in '$BackendDir'"
}

$projectRoot = Resolve-ProjectRoot -ManagePyPath $managePy
$pythonCandidates = @(
  (Join-Path $projectRoot 'env\Scripts\python.exe'),
  (Join-Path (Split-Path $projectRoot -Parent) 'env\Scripts\python.exe')
)
$python = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $python) {
  throw "Python virtual environment not found in expected locations: $($pythonCandidates -join ', ')"
}

if (-not $env:INVENTREE_DESKTOP_MODE) {
  $env:INVENTREE_DESKTOP_MODE = '1'
}

if (-not $env:INVENTREE_DEBUG) {
  $env:INVENTREE_DEBUG = '1'
}

if (-not $env:INVENTREE_DESKTOP_DATA_DIR) {
  $desktopRoot = if ($env:LOCALAPPDATA) {
    Join-Path $env:LOCALAPPDATA 'TrackletDesktop'
  } elseif ($env:APPDATA) {
    Join-Path $env:APPDATA 'TrackletDesktop'
  } else {
    Join-Path $projectRoot 'runtime-data'
  }

  $env:INVENTREE_DESKTOP_DATA_DIR = $desktopRoot
}

Write-Step "backendDir=$BackendDir"
Write-Step "projectRoot=$projectRoot"
Write-Step "managePy=$managePy"
Write-Step "python=$python"
Write-Step "address=$Address"
Write-Step "cwd=$projectRoot"

Push-Location $projectRoot

try {
  if ($env:INVENTREE_DESKTOP_MODE -eq '1') {
    Write-Step "command=$python $managePy runmigrations"
    & $python $managePy runmigrations
    $runMigrationsExit = $LASTEXITCODE
    Write-Step "exitCode(runmigrations)=$runMigrationsExit"

    if ($runMigrationsExit -ne 0) {
      exit $runMigrationsExit
    }

    Write-Step "command=$python $managePy migrate --run-syncdb --noinput"
    & $python $managePy migrate --run-syncdb --noinput
    $migrateExit = $LASTEXITCODE
    Write-Step "exitCode(migrate)=$migrateExit"

    if ($migrateExit -ne 0) {
      exit $migrateExit
    }
  }

  Write-Step "command=$python -m invoke dev.server -a $Address"
  & $python -m invoke dev.server -a $Address
  $serverExit = $LASTEXITCODE
  Write-Step "exitCode(dev.server)=$serverExit"
  exit $serverExit
}
finally {
  Pop-Location
}
