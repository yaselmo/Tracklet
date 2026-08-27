#requires -Version 5.1

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'TrackletDesktop'),
  [string]$BackendDir,
  [switch]$ReplaceExisting
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-NormalizedPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Get-RelativeArchivePath {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$FilePath
  )

  $relative = $FilePath.Substring($BasePath.Length).TrimStart([char[]]@('\', '/'))
  return ($relative -replace '\\', '/')
}

function Assert-TrackletStopped {
  $blocked = @()

  @(Get-Process -Name 'Tracklet' -ErrorAction SilentlyContinue) |
    Where-Object { $_.Id -ne $PID } |
    ForEach-Object {
      $blocked += "Tracklet.exe pid=$($_.Id)"
    }

  try {
    @(Get-CimInstance Win32_Process -ErrorAction Stop) |
      Where-Object {
        $_.ProcessId -ne $PID -and
        $_.Name -match '^(python|pythonw|node|nodejs|pwsh|powershell)\.exe$' -and
        $_.CommandLine -and
        $_.CommandLine -match '(?i)(Tracklet|manage\.py|qcluster|runserver|start-backend)'
      } |
      ForEach-Object {
        $blocked += "$($_.Name) pid=$($_.ProcessId)"
      }
  }
  catch {
    throw 'Could not inspect running process command lines. Stop Tracklet and its backend/worker manually, then run the restore again.'
  }

  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    @(Get-NetTCPConnection -State Listen -ErrorAction Stop) |
      Where-Object { $_.LocalPort -in @(8000, 5173, 64740, 6379) } |
      ForEach-Object {
        $blocked += "listen $($_.LocalAddress):$($_.LocalPort) pid=$($_.OwningProcess)"
      }
  }

  if ($blocked.Count -gt 0) {
    $details = $blocked | Sort-Object -Unique
    throw "Tracklet is still running or a relevant Tracklet port is active:`n$($details -join "`n")`nClose Tracklet, the Django backend, and any worker, then retry. No target data was changed."
  }
}

function Replace-PathInText {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$OldPath,
    [Parameter(Mandatory = $true)][string]$NewPath
  )

  if ([string]::IsNullOrWhiteSpace($OldPath)) {
    return $Text
  }

  $evaluator = [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $NewPath }
  return [System.Text.RegularExpressions.Regex]::Replace(
    $Text,
    [System.Text.RegularExpressions.Regex]::Escape($OldPath),
    $evaluator,
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
}

function Assert-ManifestFile {
  param(
    [Parameter(Mandatory = $true)][string]$StageRoot,
    [Parameter(Mandatory = $true)]$ManifestFile
  )

  $filePath = Join-Path $StageRoot ($ManifestFile.path -replace '/', '\')
  if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
    throw "Archive is missing manifest file: $($ManifestFile.path)"
  }

  $file = Get-Item -LiteralPath $filePath
  if ([int64]$file.Length -ne [int64]$ManifestFile.length) {
    throw "Length mismatch for archive file: $($ManifestFile.path)"
  }

  $hash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
  if ($hash -ne [string]$ManifestFile.sha256) {
    throw "SHA-256 mismatch for archive file: $($ManifestFile.path)"
  }
}

function Resolve-BackendPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
  $candidates = @(
    (Join-Path $resolved 'manage.py'),
    (Join-Path $resolved 'src\backend\Tracklet\manage.py')
  )

  if (-not ($candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })) {
    throw "BackendDir is not a Tracklet project root or backend folder containing manage.py: $resolved"
  }

  return $resolved
}

$archivePath = (Resolve-Path -LiteralPath $ArchivePath -ErrorAction Stop).Path
$targetRoot = Get-NormalizedPath -Path $DataRoot
$targetParent = Split-Path -Path $targetRoot -Parent

Assert-TrackletStopped

if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
  throw "Backup archive was not found: $archivePath"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$sidecar = "$archivePath.sha256"
if (Test-Path -LiteralPath $sidecar -PathType Leaf) {
  $expectedArchiveHash = ((Get-Content -LiteralPath $sidecar -Raw).Trim() -split '\s+')[0].ToUpperInvariant()
  $actualArchiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($expectedArchiveHash -ne $actualArchiveHash) {
    throw "Backup archive SHA-256 does not match its sidecar. The archive was not restored."
  }
  Write-Output "Archive SHA-256 verified: $actualArchiveHash"
}
else {
  Write-Warning "No .sha256 sidecar was found. The archive will still be checked against its internal manifest."
}

$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('TrackletRestore-' + [guid]::NewGuid().ToString('N'))
$restoreRoot = "$targetRoot.restore-$((Get-Date).ToString('yyyyMMdd-HHmmss'))-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$safetyRoot = $null
$targetMoved = $false

try {
  New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

  $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $entryNames = @($zip.Entries | ForEach-Object { $_.FullName })
    foreach ($requiredEntry in @('metadata/manifest.json', 'payload/data/database.sqlite3')) {
      if ($entryNames -notcontains $requiredEntry) {
        throw "Backup archive is missing required entry: $requiredEntry"
      }
    }
  }
  finally {
    $zip.Dispose()
  }

  [System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $stageRoot)

  $manifestPath = Join-Path $stageRoot 'metadata\manifest.json'
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ([int]$manifest.formatVersion -ne 1) {
    throw "Unsupported Tracklet backup format: $($manifest.formatVersion)"
  }

  $sourceRoot = Get-NormalizedPath -Path ([string]$manifest.sourceDataRoot)
  if ($targetRoot.Equals($sourceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to restore onto the source data root. The original Tracklet data must remain untouched: $sourceRoot"
  }

  foreach ($manifestFile in @($manifest.files)) {
    Assert-ManifestFile -StageRoot $stageRoot -ManifestFile $manifestFile
  }

  $databaseStagePath = Join-Path $stageRoot 'payload\data\database.sqlite3'
  if ((Get-Item -LiteralPath $databaseStagePath).Length -le 0) {
    throw 'The archived SQLite database is empty.'
  }

  $mediaStagePath = Join-Path $stageRoot 'payload\data\media'
  if (-not (Test-Path -LiteralPath $mediaStagePath -PathType Container)) {
    throw 'The archive does not contain the required media directory.'
  }

  New-Item -ItemType Directory -Path (Join-Path $restoreRoot 'data'),(Join-Path $restoreRoot 'config') -Force | Out-Null
  @(Get-ChildItem -LiteralPath (Join-Path $stageRoot 'payload\data') -Force -ErrorAction Stop) |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $restoreRoot 'data') -Recurse -Force }
  @(Get-ChildItem -LiteralPath (Join-Path $stageRoot 'payload\config') -Force -ErrorAction Stop) |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $restoreRoot 'config') -Recurse -Force }

  $configPath = Join-Path $restoreRoot 'config\config.yaml'
  if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    $configText = Get-Content -LiteralPath $configPath -Raw
    $configText = Replace-PathInText -Text $configText -OldPath ([string]$manifest.sourceDataRoot) -NewPath $targetRoot
    $configText = Replace-PathInText -Text $configText -OldPath ([string]$manifest.sourceDatabaseFile) -NewPath (Join-Path $targetRoot 'data\database.sqlite3')
    $configText = Replace-PathInText -Text $configText -OldPath ([string]$manifest.sourceMediaDirectory) -NewPath (Join-Path $targetRoot 'data\media')
    $configText = Replace-PathInText -Text $configText -OldPath ([string]$manifest.sourceConfigDirectory) -NewPath (Join-Path $targetRoot 'config')
    $configText = Replace-PathInText -Text $configText -OldPath (Join-Path $sourceRoot 'data\static') -NewPath (Join-Path $targetRoot 'data\static')
    $configText = Replace-PathInText -Text $configText -OldPath (Join-Path $sourceRoot 'backups') -NewPath (Join-Path $targetRoot 'backups')
    Set-Content -LiteralPath $configPath -Value $configText -Encoding UTF8
  }

  New-Item -ItemType Directory -Path (Join-Path $restoreRoot 'backups'),(Join-Path $restoreRoot 'logs') -Force | Out-Null

  $preflightDatabase = Join-Path $restoreRoot 'data\database.sqlite3'
  $preflightDatabaseHash = (Get-FileHash -LiteralPath $preflightDatabase -Algorithm SHA256).Hash
  if ($preflightDatabaseHash -ne [string]$manifest.database.sha256) {
    throw 'The prepared restore database SHA-256 does not match the archive manifest.'
  }

  $preflightMediaFiles = @(Get-ChildItem -LiteralPath (Join-Path $restoreRoot 'data\media') -Recurse -Force -File -ErrorAction Stop)
  if ($preflightMediaFiles.Count -ne [int]$manifest.media.fileCount) {
    throw "The prepared restore media file count does not match the archive manifest. Expected $($manifest.media.fileCount), found $($preflightMediaFiles.Count)."
  }

  if (-not [string]::IsNullOrWhiteSpace($BackendDir)) {
    $resolvedBackend = Resolve-BackendPath -Path $BackendDir
    $electronRoot = Join-Path $restoreRoot 'electron'
    New-Item -ItemType Directory -Path $electronRoot -Force | Out-Null
    @{ backendDir = $resolvedBackend } |
      ConvertTo-Json -Depth 4 |
      Set-Content -LiteralPath (Join-Path $electronRoot 'backend-config.json') -Encoding UTF8
  }

  New-Item -ItemType Directory -Path $targetParent -Force | Out-Null

  if (Test-Path -LiteralPath $targetRoot) {
    if (-not $ReplaceExisting) {
      throw "Target data root already exists. Nothing was changed. Re-run with -ReplaceExisting only after confirming this is the intended new-PC target: $targetRoot"
    }

    $safetyRoot = "$targetRoot.pre-restore-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
    while (Test-Path -LiteralPath $safetyRoot) {
      $safetyRoot = "$targetRoot.pre-restore-$((Get-Date).ToString('yyyyMMdd-HHmmss'))-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
    }

    Move-Item -LiteralPath $targetRoot -Destination $safetyRoot
    $targetMoved = $true
  }

  Move-Item -LiteralPath $restoreRoot -Destination $targetRoot

  $restoredDatabase = Join-Path $targetRoot 'data\database.sqlite3'
  $restoredHash = (Get-FileHash -LiteralPath $restoredDatabase -Algorithm SHA256).Hash
  if ($restoredHash -ne [string]$manifest.database.sha256) {
    throw "Restored database SHA-256 does not match the archive manifest. Safety data remains at: $safetyRoot"
  }

  $restoredMediaFiles = @(Get-ChildItem -LiteralPath (Join-Path $targetRoot 'data\media') -Recurse -Force -File -ErrorAction Stop)
  if ($restoredMediaFiles.Count -ne [int]$manifest.media.fileCount) {
    throw "Restored media file count does not match the archive manifest. Expected $($manifest.media.fileCount), found $($restoredMediaFiles.Count). Safety data remains at: $safetyRoot"
  }

  Write-Output 'Tracklet restore completed successfully.'
  Write-Output "Restored data root: $targetRoot"
  Write-Output "Database SHA-256: $restoredHash"
  Write-Output "Media files: $($restoredMediaFiles.Count)"
  if ($safetyRoot) {
    Write-Output "Existing target preserved at: $safetyRoot"
  }
  if ([string]::IsNullOrWhiteSpace($BackendDir)) {
    Write-Output 'Electron backend-config.json was not written. On the new PC, use Locate Backend once, or rerun with -BackendDir pointing to the valid Tracklet backend.'
  }
  else {
    Write-Output "Electron backend path configured for this machine: $BackendDir"
  }
  Write-Output 'Keep the original archive and any safety directory until login, counts, media, attachments, uploads, and restart verification are complete.'
}
catch {
  if ($targetMoved -and (Test-Path -LiteralPath $safetyRoot) -and -not (Test-Path -LiteralPath $targetRoot)) {
    Move-Item -LiteralPath $safetyRoot -Destination $targetRoot
  }
  throw
}
finally {
  if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
  if (Test-Path -LiteralPath $restoreRoot) {
    Remove-Item -LiteralPath $restoreRoot -Recurse -Force
  }
}
