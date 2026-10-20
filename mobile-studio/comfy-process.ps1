param([ValidateSet('inspect','restart')][string]$Action='inspect',[int]$ExpectedPid=0,[string]$ExpectedStarted='')
$ErrorActionPreference='Stop'
$instanceRoot=Join-Path $env:LOCALAPPDATA 'Comfy-Desktop/ComfyUI-Installs/viator comfy'
$expectedPython=Join-Path $instanceRoot 'standalone-env/python.exe'
$launcherPython=Join-Path $instanceRoot 'ComfyUI/.venv/Scripts/python.exe'
$desktopPath=Join-Path $env:LOCALAPPDATA 'Programs/Comfy Desktop/Comfy Desktop.exe'
function Apply-DesktopUpdateHold($Snapshot,$Hold,[datetime]$Now=(Get-Date)) {
 if($Hold -and !$Snapshot.pid){
  try {
   $expires=([datetime]$Hold.expiresAt).ToUniversalTime()
   if($expires -gt $Now.ToUniversalTime() -and $expires -le $Now.ToUniversalTime().AddMinutes(31)){
    $Snapshot.recoverable=$false
    $Snapshot.updateHoldUntil=$expires.ToString('o')
   }
  }catch{}
 }
 return $Snapshot
}
function Get-EngineState($Processes,$Listeners,$Stats,$Queue,[datetime]$Now=(Get-Date)) {
 $engines=@($Processes | Where-Object { ($_.ExecutablePath -eq $expectedPython -or $_.ExecutablePath -eq $launcherPython) -and $_.CommandLine -match 'ComfyUI[\\/]main\.py(?:\s|$)' })
 $owners=@($Listeners | Select-Object -ExpandProperty OwningProcess -Unique)
 $target=@($engines | Where-Object {$_.ProcessId -in $owners})
 $foreign=@($owners | Where-Object {$_ -notin @($engines.ProcessId)})
 $desktop=@($Processes | Where-Object {$_.ExecutablePath -eq $desktopPath})
 $owned=$false;$launcher=$null
 if($target.Count -eq 0 -and $engines.Count){$target=@($engines | Sort-Object CreationDate -Descending | Select-Object -First 1)}
 if($target.Count -eq 1){
  $launcher=$target[0]
  if($launcher.ExecutablePath -eq $expectedPython){$parent=$launcher.ParentProcessId;$launcher=$Processes | Where-Object {$_.ProcessId -eq $parent} | Select-Object -First 1}
  if($launcher -and $launcher.ExecutablePath -eq $launcherPython -and $launcher.CommandLine -eq $target[0].CommandLine -and $launcher.CommandLine -match '(?:^|\s)--enable-manager(?:\s|$)'){$owned=@($desktop | Where-Object {$_.ProcessId -eq $launcher.ParentProcessId}).Count -eq 1}
 }
 $apiReady=$null -ne $Stats -and $null -ne $Stats.system -and $null -ne $Queue -and $Queue.queue_running -is [array] -and $Queue.queue_pending -is [array]
 $state='stopped'
 if($foreign.Count -or $target.Count -gt 1){$state='foreign'}
 elseif($apiReady -and $target.Count -eq 1){$state=if($Queue.queue_running.Count -or $Queue.queue_pending.Count){'busy'}else{'ready'}}
 elseif($engines.Count){
  $recent=@($engines | Where-Object {$_.CreationDate -and ($Now-[datetime]$_.CreationDate).TotalSeconds -lt 240})
  $state=if($recent.Count){'starting'}else{'unresponsive'}
 }
 $p=if($target.Count -eq 1){$target[0]}elseif($engines.Count){$engines | Sort-Object CreationDate -Descending | Select-Object -First 1}else{$null}
 return @{state=$state;pid=if($p){[int]$p.ProcessId}else{0};started=if($p -and $p.CreationDate){([datetime]$p.CreationDate).ToUniversalTime().ToString('o')}else{''};launcherPid=if($launcher){[int]$launcher.ProcessId}else{0};desktopOwned=$owned;recoverable=($state -ne 'foreign' -and ($engines.Count -gt 0 -or (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'data/comfy-launch.json'))));apiReady=$apiReady;offline=!$apiReady;launchReady=($owned -and $state -eq 'ready');running=if($apiReady){$Queue.queue_running.Count}else{$null};pending=if($apiReady){$Queue.queue_pending.Count}else{$null}}
}
function Get-EngineSnapshot {
 $processes=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -in @('python.exe','Comfy Desktop.exe')})
 $listeners=@(Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue)
 $stats=$null;$queue=$null
 try{$stats=Invoke-RestMethod 'http://127.0.0.1:8188/system_stats' -TimeoutSec 2}catch{}
 try{$queue=Invoke-RestMethod 'http://127.0.0.1:8188/queue' -TimeoutSec 2}catch{}
 $s=Get-EngineState $processes $listeners $stats $queue
 $hold=$null
 try{$hold=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'data/comfy-desktop-update.json') -Raw | ConvertFrom-Json}catch{}
 $s=Apply-DesktopUpdateHold $s $hold
 if($s.pid -and $s.state -ne 'foreign'){
  $p=$processes | Where-Object {$_.ProcessId -eq $s.pid} | Select-Object -First 1
  $arguments=$p.CommandLine -replace '^\s*(?:"[^"]+"|\S+)\s*',''
  @{executable=$launcherPython;arguments=$arguments;cwd=$instanceRoot} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'data/comfy-launch.json') -Encoding UTF8
 }
 return $s
}
function Invoke-DesktopRestart($ExpectedPid,$ExpectedStarted) {
 $s=Get-EngineSnapshot
 if($s.pid -ne $ExpectedPid -or $s.started -ne $ExpectedStarted){throw 'ComfyUI 대상이 바뀌었습니다. 상태를 다시 확인하세요.'}
 if(!$s.recoverable -or $s.state -eq 'foreign'){throw '8188 포트의 대상 설치를 확인할 수 없습니다.'}
 $config=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'data/comfy-launch.json') -Raw | ConvertFrom-Json
 if($config.executable -notin @($expectedPython,$launcherPython) -or $config.cwd -ne $instanceRoot -or $config.arguments -notmatch 'ComfyUI[\\/]main\.py(?:\s|$)'){throw '저장된 엔진 실행 정보가 올바르지 않습니다.'}
 if($s.state -ne 'ready' -or !$s.desktopOwned){
  if($s.pid){
   $killId=if($s.launcherPid -and $s.desktopOwned){$s.launcherPid}else{$s.pid}
   & taskkill.exe /PID $killId /T /F | Out-Null
   if($LASTEXITCODE -ne 0){throw '엔진 종료를 확인하지 못했습니다.'}
   Wait-Process -Id $s.pid -Timeout 15 -ErrorAction SilentlyContinue
  }
  $check=Get-EngineSnapshot
  for($attempt=0;$check.pid -eq $s.pid -and $check.pid -gt 0 -and $attempt -lt 3;$attempt++){
   Start-Sleep -Seconds 1
   $check=Get-EngineSnapshot
  }
  if($check.pid -gt 0 -and $check.pid -ne $s.pid -and $check.recoverable -and $check.state -ne 'foreign'){
   return @{previousPid=$s.pid;requested=$true;method='existing-recovery';pid=$check.pid}
  }
  if($check.pid -or $check.state -eq 'foreign'){throw '엔진 또는 포트가 아직 사용 중입니다. 중복 실행하지 않습니다.'}
  $child=Start-Process -FilePath $launcherPython -ArgumentList $config.arguments -WorkingDirectory $config.cwd -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'data/comfy-recovery.log') -RedirectStandardError (Join-Path $PSScriptRoot 'data/comfy-recovery-error.log')
  return @{previousPid=$s.pid;requested=$true;method='same-install-recovery';pid=$child.Id}
 }
 # Manager writes the session reboot marker; Desktop owns shutdown and respawn.
 # Never retry an ambiguous disconnect or fall back to force termination.
 try {
  Invoke-RestMethod 'http://127.0.0.1:8188/v2/manager/reboot' -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 8 | Out-Null
 } catch {
  if($_.Exception.Response){throw 'Desktop 재시작 요청이 거부되었습니다. Comfy Desktop에서 다시 시작하세요.'}
 }
 @{previousPid=$s.pid;requested=$true;method='desktop-manager'}
}
if($MyInvocation.InvocationName -ne '.'){
 if($Action -eq 'inspect'){Get-EngineSnapshot | ConvertTo-Json -Compress}
 else{Invoke-DesktopRestart $ExpectedPid $ExpectedStarted | ConvertTo-Json -Compress}
}
