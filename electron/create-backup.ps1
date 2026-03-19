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

$backupDir = Join-Path $env:INVENTREE_DESKTOP_DATA_DIR 'backups'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$before = @{}
Get-ChildItem -Path $backupDir -File -ErrorAction SilentlyContinue | ForEach-Object {
  $before[$_.FullName] = $_.LastWriteTimeUtc
}

Push-Location $projectRoot

try {
  $dbOutput = (& $python $managePy dbbackup --noinput --clean --compress 2>&1 | Out-String).Trim()
  $mediaOutput = (& $python $managePy mediabackup --noinput --clean --compress 2>&1 | Out-String).Trim()

  $createdFiles = @()

  Get-ChildItem -Path $backupDir -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    ForEach-Object {
      if (-not $before.ContainsKey($_.FullName) -or $before[$_.FullName] -ne $_.LastWriteTimeUtc) {
        $createdFiles += $_.FullName
      }
    }

  @{
    ok = $true
    backupDir = $backupDir
    files = $createdFiles
    dbOutput = $dbOutput
    mediaOutput = $mediaOutput
  } | ConvertTo-Json -Compress -Depth 4
}
catch {
  @{
    ok = $false
    backupDir = $backupDir
    error = $_.Exception.Message
  } | ConvertTo-Json -Compress -Depth 4
  exit 1
}
finally {
  Pop-Location
}
