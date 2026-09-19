$ErrorActionPreference = "Stop"

$projectRoot = "D:\HermesWorkspace\directorMaster"
$appUrl = "http://localhost:3000/"
$port = 3000
$logRoot = Join-Path $projectRoot "workspace\logs"

function Test-DirectorPort {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.ConnectAsync("127.0.0.1", $port)
    if (-not $connection.Wait(350)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

if (-not (Test-DirectorPort)) {
  New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  $startOptions = @{
    FilePath = $npm
    ArgumentList = @("run", "dev")
    WorkingDirectory = $projectRoot
    WindowStyle = "Hidden"
    RedirectStandardOutput = (Join-Path $logRoot "director-master.out.log")
    RedirectStandardError = (Join-Path $logRoot "director-master.err.log")
  }
  Start-Process @startOptions | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-DirectorPort) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "Director Master 启动超时。请查看 workspace\logs\director-master.err.log。",
      "Director Master",
      "OK",
      "Error"
    ) | Out-Null
    exit 1
  }
}

Start-Process $appUrl
