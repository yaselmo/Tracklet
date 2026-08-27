#requires -Version 5.1

[CmdletBinding()]
param(
  [string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'TrackletDesktop'),
  [string]$DestinationDirectory = (Get-Location).Path
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
    throw 'Could not inspect running process command lines. Stop Tracklet and its backend/worker manually, then run the backup again.'
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
    throw "Tracklet is still running or a relevant Tracklet port is active:`n$($details -join "`n")`nClose Tracklet, the Django backend, and any worker, then retry. No backup files were created."
  }
}

function Copy-DirectoryContents {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null

  @(Get-ChildItem -LiteralPath $Source -Force -ErrorAction Stop) |
    ForEach-Object {
      if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Reparse points are not supported in migration data: $($_.FullName)"
      }

      Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
}

function Get-ManifestFileEntry {
  param(
    [Parameter(Mandatory = $true)][string]$StageRoot,
    [Parameter(Mandatory = $true)][System.IO.FileInfo]$File
  )

  $relative = Get-RelativeArchivePath -BasePath $StageRoot -FilePath $File.FullName
  return [ordered]@{
    path = $relative
    length = [int64]$File.Length
    sha256 = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash
  }
}

$dataRoot = Get-NormalizedPath -Path $DataRoot
$destinationDirectory = Get-NormalizedPath -Path $DestinationDirectory
$configRoot = Join-Path $dataRoot 'config'
$dataDirectory = Join-Path $dataRoot 'data'
$databaseFile = Join-Path $dataDirectory 'database.sqlite3'
$mediaDirectory = Join-Path $dataDirectory 'media'

Assert-TrackletStopped

if (-not (Test-Path -LiteralPath $dataRoot -PathType Container)) {
  throw "Tracklet data root was not found: $dataRoot"
}

if (-not (Test-Path -LiteralPath $databaseFile -PathType Leaf)) {
  throw "Tracklet SQLite database was not found: $databaseFile"
}

if ((Get-Item -LiteralPath $databaseFile).Length -le 0) {
  throw "Tracklet SQLite database is empty: $databaseFile"
}

if (-not (Test-Path -LiteralPath $mediaDirectory -PathType Container)) {
  throw "Tracklet media directory was not found: $mediaDirectory"
}

if (-not (Test-Path -LiteralPath $configRoot -PathType Container)) {
  throw "Tracklet config directory was not found: $configRoot"
}

New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null

$timestamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
$archivePath = Join-Path $destinationDirectory "TrackletBackup-$timestamp.zip"
$suffix = 1
while (Test-Path -LiteralPath $archivePath) {
  $archivePath = Join-Path $destinationDirectory "TrackletBackup-$timestamp-$suffix.zip"
  $suffix++
}

$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('TrackletBackup-' + [guid]::NewGuid().ToString('N'))
$payloadRoot = Join-Path $stageRoot 'payload'
$metadataRoot = Join-Path $stageRoot 'metadata'

try {
  New-Item -ItemType Directory -Path $payloadRoot,$metadataRoot -Force | Out-Null

  Copy-DirectoryContents -Source $dataDirectory -Destination (Join-Path $payloadRoot 'data')
  Copy-DirectoryContents -Source $configRoot -Destination (Join-Path $payloadRoot 'config')

  $electronConfig = Join-Path $dataRoot 'electron\backend-config.json'
  if (Test-Path -LiteralPath $electronConfig -PathType Leaf) {
    Copy-Item -LiteralPath $electronConfig -Destination (Join-Path $metadataRoot 'original-backend-config.json') -Force
  }

  $mediaFiles = @(Get-ChildItem -LiteralPath $mediaDirectory -Recurse -Force -File -ErrorAction Stop)
  $attachmentDirectory = Join-Path $mediaDirectory 'attachments'
  $attachmentFiles = @()
  if (Test-Path -LiteralPath $attachmentDirectory -PathType Container) {
    $attachmentFiles = @(Get-ChildItem -LiteralPath $attachmentDirectory -Recurse -Force -File -ErrorAction Stop)
  }

  $stageFiles = @(Get-ChildItem -LiteralPath $stageRoot -Recurse -Force -File -ErrorAction Stop)
  $manifestFiles = @(
    $stageFiles |
      Where-Object { $_.FullName -notlike (Join-Path $metadataRoot 'manifest.json') } |
      ForEach-Object { Get-ManifestFileEntry -StageRoot $stageRoot -File $_ }
  )

  $databaseStageFile = Join-Path $payloadRoot 'data\database.sqlite3'
  $manifest = [ordered]@{
    formatVersion = 1
    createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    sourceDataRoot = $dataRoot
    sourceDatabaseFile = $databaseFile
    sourceMediaDirectory = $mediaDirectory
    sourceConfigDirectory = $configRoot
    database = [ordered]@{
      relativePath = 'payload/data/database.sqlite3'
      length = [int64](Get-Item -LiteralPath $databaseStageFile).Length
      sha256 = (Get-FileHash -LiteralPath $databaseStageFile -Algorithm SHA256).Hash
    }
    media = [ordered]@{
      relativePath = 'payload/data/media'
      fileCount = $mediaFiles.Count
      byteCount = [int64](($mediaFiles | Measure-Object -Property Length -Sum).Sum)
    }
    attachments = [ordered]@{
      relativePath = 'payload/data/media/attachments'
      fileCount = $attachmentFiles.Count
      byteCount = [int64](($attachmentFiles | Measure-Object -Property Length -Sum).Sum)
    }
    files = $manifestFiles
  }

  $manifestPath = Join-Path $metadataRoot 'manifest.json'
  $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stageRoot,
    $archivePath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )

  $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $requiredEntries = @('metadata/manifest.json', 'payload/data/database.sqlite3')
    $entryNames = @($zip.Entries | ForEach-Object { $_.FullName })
    foreach ($requiredEntry in $requiredEntries) {
      if ($entryNames -notcontains $requiredEntry) {
        throw "Backup archive is missing required entry: $requiredEntry"
      }
    }

    foreach ($entry in $zip.Entries) {
      $stream = $entry.Open()
      try {
        $stream.CopyTo([System.IO.Stream]::Null)
      }
      finally {
        $stream.Dispose()
      }
    }
  }
  finally {
    $zip.Dispose()
  }

  $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
  $hashFile = "$archivePath.sha256"
  "$archiveHash  $([IO.Path]::GetFileName($archivePath))" | Set-Content -LiteralPath $hashFile -Encoding ASCII

  Write-Output 'Tracklet backup created successfully.'
  Write-Output "Archive: $archivePath"
  Write-Output "Archive SHA-256: $archiveHash"
  Write-Output "Database: $databaseFile"
  Write-Output "Database bytes: $((Get-Item -LiteralPath $databaseFile).Length)"
  Write-Output "Database SHA-256: $($manifest.database.sha256)"
  Write-Output "Media files: $($manifest.media.fileCount)"
  Write-Output "Media bytes: $($manifest.media.byteCount)"
  Write-Output "Attachment files: $($manifest.attachments.fileCount)"
  Write-Output "Archive verification: opened and every entry was read successfully"
  Write-Output "Hash sidecar: $hashFile"
  Write-Output 'The archive contains data and persistent config only; Electron cache, logs, state, and existing backups were not included.'
}
finally {
  if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
}
