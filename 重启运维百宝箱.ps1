$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 3000

$listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
    Stop-Process -Id $listener.OwningProcess -ErrorAction Stop
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden
Start-Sleep -Seconds 2
Start-Process "http://127.0.0.1:$port"
