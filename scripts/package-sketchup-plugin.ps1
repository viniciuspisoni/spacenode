param(
  [string]$OutputPath = "dist/spacenode-sketchup-mvp.rbz"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $root "sketchup"
$entryFile = Join-Path $sourceRoot "spacenode.rb"
$entryDir = Join-Path $sourceRoot "spacenode"
$staging = Join-Path $root ".tmp\spacenode-rbz"
$resolvedOutput = Join-Path $root $OutputPath
$outputDir = Split-Path -Parent $resolvedOutput
$tmpZip = [System.IO.Path]::ChangeExtension($resolvedOutput, ".zip")

if (!(Test-Path -LiteralPath $entryFile)) {
  throw "Arquivo de entrada não encontrado: $entryFile"
}

if (!(Test-Path -LiteralPath $entryDir)) {
  throw "Diretório da extensão não encontrado: $entryDir"
}

Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $staging | Out-Null
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Copy-Item -LiteralPath $entryFile -Destination $staging
Copy-Item -LiteralPath $entryDir -Destination $staging -Recurse

Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $resolvedOutput -Force -ErrorAction SilentlyContinue

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $tmpZip -Force
Move-Item -LiteralPath $tmpZip -Destination $resolvedOutput -Force

Remove-Item -LiteralPath $staging -Recurse -Force

Write-Host "RBZ gerado em $resolvedOutput"
