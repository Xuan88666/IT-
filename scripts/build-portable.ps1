[CmdletBinding()]
param([string]$OutputRoot = '')

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ([string]::IsNullOrWhiteSpace($OutputRoot)) { $OutputRoot = Join-Path $projectRoot 'release' }
$outputRootPath = [System.IO.Path]::GetFullPath($OutputRoot)
if (-not $outputRootPath.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Portable package output must stay inside the project directory.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$packageRoot = Join-Path $outputRootPath "IT-Ops-Toolbox-Portable-$stamp"
$appRoot = Join-Path $packageRoot 'app'
$runtimeRoot = Join-Path $packageRoot 'runtime'
New-Item -ItemType Directory -Force -Path $appRoot, $runtimeRoot, (Join-Path $appRoot 'data') | Out-Null

$files = @(
  'server.mjs', 'server.js', 'app.js', 'index.html', 'toolkit.css', 'bento.css',
  'version-update.css', 'version-update.js', 'package.json', 'package-lock.json', 'README.md', '.env.example'
)
foreach ($file in $files) {
  $source = Join-Path $projectRoot $file
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $appRoot -Force }
}
foreach ($dir in @('agent', 'server', 'vendor')) {
  $source = Join-Path $projectRoot $dir
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $appRoot -Recurse -Force }
}
$seedSource = Join-Path $projectRoot 'data\knowledge-seed.json'
if (Test-Path -LiteralPath $seedSource) { Copy-Item -LiteralPath $seedSource -Destination (Join-Path $appRoot 'data') -Force }

$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $runtimeRoot 'node.exe') -Force

Push-Location $appRoot
try { & npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund }
finally { Pop-Location }

$launcher = @'
@echo off
setlocal
cd /d "%~dp0app"
start "IT Ops Toolbox" /min "%~dp0runtime\node.exe" server.mjs
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8787/
'@
[System.IO.File]::WriteAllText((Join-Path $packageRoot 'Start-IT-Ops-Toolbox.cmd'), $launcher, [System.Text.Encoding]::ASCII)

$stopper = @'
@echo off
setlocal
powershell.exe -NoProfile -Command "$root=[IO.Path]::GetFullPath('%~dp0app\server.mjs'); Get-CimInstance Win32_Process -Filter 'Name = ''node.exe''' | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
'@
[System.IO.File]::WriteAllText((Join-Path $packageRoot 'Stop-IT-Ops-Toolbox.cmd'), $stopper, [System.Text.Encoding]::ASCII)

$notice = @"
IT Ops Toolbox Portable Edition

1. Double click Start-IT-Ops-Toolbox.cmd.
2. Open http://127.0.0.1:8787/ in a browser.
3. Data is stored in app\data. Export ITOpsToolboxBackup/2 regularly.
4. Create app\.env from app\.env.example for AI settings. No development secret is included.
5. Double click Stop-IT-Ops-Toolbox.cmd to stop only this portable package Node process.
"@
[System.IO.File]::WriteAllText((Join-Path $packageRoot 'README.txt'), $notice, [System.Text.Encoding]::ASCII)

$zipPath = "$packageRoot.zip"
Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -CompressionLevel Optimal
Write-Host "Portable directory: $packageRoot"
Write-Host "Portable archive: $zipPath"
