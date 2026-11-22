# ==============================================================================
# k-Ecosystem Release ZIP Archiver (by kipsway)
# Compresses dist/ into a single standalone k-Ecosystem-v1.0.0-release.zip
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..")
$DistDir = Join-Path $RootDir "dist"
$ZipOutput = Join-Path $RootDir "k-Ecosystem-v1.0.0-release.zip"

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  📦 Архивация релизного пакета в единый ZIP-архив" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Magenta

if (-not (Test-Path $DistDir)) {
    Write-Host "Каталог dist/ не найден. Запуск сборщика dist..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $RootDir "tools\export_dist_bundle.ps1")
}

if (Test-Path $ZipOutput) {
    Remove-Item -Force $ZipOutput
}

Write-Host "`nСжатие $DistDir -> $ZipOutput..." -ForegroundColor Yellow
Compress-Archive -Path "$DistDir\*" -DestinationPath $ZipOutput -CompressionLevel Optimal

$zipItem = Get-Item $ZipOutput
$hash = (Get-FileHash -Path $ZipOutput -Algorithm SHA256).Hash

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  🎉 Релизный архив успешно сформирован!" -ForegroundColor Green
Write-Host "  Файл:      $ZipOutput" -ForegroundColor Cyan
Write-Host "  Размер:    $([math]::Round($zipItem.Length / 1KB, 2)) КБ" -ForegroundColor Cyan
Write-Host "  SHA-256:   $hash" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
