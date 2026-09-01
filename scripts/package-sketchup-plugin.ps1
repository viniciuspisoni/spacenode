param(
  [string]$OutputPath = "dist/spacenode-sketchup.rbz"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $root "sketchup"
$entryFile = Join-Path $sourceRoot "spacenode.rb"
$entryDir = Join-Path $sourceRoot "spacenode"
$staging = Join-Path $root ".tmp\spacenode-rbz"
$resolvedOutput = Join-Path $root $OutputPath
$outputDir = Split-Path -Parent $resolvedOutput

if (!(Test-Path -LiteralPath $entryFile)) {
  throw "Arquivo de entrada nao encontrado: $entryFile"
}
if (!(Test-Path -LiteralPath $entryDir)) {
  throw "Diretorio da extensao nao encontrado: $entryDir"
}

Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $staging | Out-Null
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Copy-Item -LiteralPath $entryFile -Destination $staging
Copy-Item -LiteralPath $entryDir -Destination $staging -Recurse

Remove-Item -LiteralPath $resolvedOutput -Force -ErrorAction SilentlyContinue

# Zip montado entrada a entrada com separador "/" forcado: tanto o
# Compress-Archive quanto o CreateFromDirectory do .NET Framework 4.x
# gravam "\" e o SketchUp do macOS descompacta errado.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($resolvedOutput, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $stagingFull = (Get-Item -LiteralPath $staging).FullName
  Get-ChildItem -LiteralPath $staging -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($stagingFull.Length + 1) -replace "\\", "/"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive, $_.FullName, $relative,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}

Remove-Item -LiteralPath $staging -Recurse -Force

# Sanidade: toda entrada do zip precisa usar "/" e a raiz precisa ter
# exatamente spacenode.rb + pasta spacenode/.
$zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedOutput)
try {
  $bad = $zip.Entries | Where-Object { $_.FullName -like "*\*" }
  if ($bad) { throw "Zip com separador invalido: $($bad[0].FullName)" }
  $rootEntries = $zip.Entries | Where-Object { $_.FullName -notmatch "/" }
  if (-not ($rootEntries.FullName -contains "spacenode.rb")) {
    throw "spacenode.rb nao esta na raiz do RBZ"
  }
} finally {
  $zip.Dispose()
}

Write-Host "RBZ gerado em $resolvedOutput"
