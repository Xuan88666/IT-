$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 3000

if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

Start-Process "http://127.0.0.1:$port"
