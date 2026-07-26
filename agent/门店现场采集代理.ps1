<#
IT Ops Toolbox field collection agent.
Read-only and one-shot: no service, remote control, or system changes.
#>
[CmdletBinding()]
param(
  [string]$OutputPath = (Join-Path $env:USERPROFILE ("Desktop\IT-Ops-Toolbox-FieldCollect-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss')))
)

$ErrorActionPreference = 'Stop'

function Get-SafeValue {
  param([scriptblock]$Script, $Fallback = $null)
  try { & $Script } catch { $Fallback }
}

$network = Get-SafeValue {
  Get-NetIPConfiguration | Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object {
    [ordered]@{
      Adapter = $_.InterfaceAlias
      MacAddress = $_.NetAdapter.MacAddress
      IPv4 = @($_.IPv4Address | ForEach-Object IPAddress)
      Gateway = @($_.IPv4DefaultGateway | ForEach-Object NextHop)
      Dns = @($_.DNSServer.ServerAddresses)
    }
  }
} @()

$disks = Get-SafeValue {
  Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter, FileSystemLabel, FileSystem, Size, SizeRemaining, HealthStatus
} @()

$printerService = Get-SafeValue {
  Get-Service -Name Spooler | Select-Object Name, Status, StartType
} $null

$report = [ordered]@{
  format = 'ITOpsToolboxAgentReport/1'
  collectedAt = (Get-Date).ToUniversalTime().ToString('o')
  collector = [ordered]@{ name = 'IT Ops Toolbox Field Collection Agent'; mode = 'one-shot-readonly'; version = '1.0' }
  computer = Get-SafeValue {
    $os = Get-CimInstance Win32_OperatingSystem
    $system = Get-CimInstance Win32_ComputerSystem
    [ordered]@{
      Name = $env:COMPUTERNAME
      Domain = $system.Domain
      Manufacturer = $system.Manufacturer
      Model = $system.Model
      OperatingSystem = $os.Caption
      Version = $os.Version
      LastBootUpTime = $os.LastBootUpTime
      FreePhysicalMemoryKB = $os.FreePhysicalMemory
    }
  } @{}
  network = @($network)
  disks = @($disks)
  printerService = $printerService
  recentSystemErrors = @(Get-SafeValue {
    Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1,2; StartTime = (Get-Date).AddDays(-3) } -MaxEvents 10 |
      ForEach-Object { [ordered]@{ TimeCreated = $_.TimeCreated; Provider = $_.ProviderName; Id = $_.Id; Message = ($_.Message -replace '\s+', ' ').Substring(0, [Math]::Min(300, ($_.Message -replace '\s+', ' ').Length)) } }
  } @())
}

$directory = Split-Path -Parent $OutputPath
if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
$json = $report | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Collection complete: $OutputPath"
Write-Host 'Import this JSON in IT Ops Toolbox, or attach it to an on-site work order as evidence.'
