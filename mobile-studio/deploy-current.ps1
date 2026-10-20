param([switch]$Worker)
$ErrorActionPreference='Stop'
$studioRoot=$PSScriptRoot
$targetPort=if($Worker){8787}else{8799}
$listener=Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue
if($listener){
 $owned=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
 $scriptMatches=$owned.CommandLine -like ('*'+(Join-Path $studioRoot 'server.mjs')+'*')
 if($Worker -and !$scriptMatches){$workerMarker=Get-Content -LiteralPath (Join-Path $studioRoot 'data/worker-v2.json') -Raw|ConvertFrom-Json;$scriptMatches=$workerMarker.pid -eq $owned.ProcessId -and $workerMarker.version -eq 6 -and $owned.CommandLine -match '\bserver\.mjs[\s"]*$'}
 if($owned.ExecutablePath -ne (Get-Command node).Source -or !$scriptMatches){throw 'PWA process identity mismatch'}
 if($Worker){
  & node (Join-Path $studioRoot 'hold-worker.mjs')
  if($LASTEXITCODE -ne 0){throw 'Worker still active; deployment deferred'}
 }
 Stop-Process -Id $owned.ProcessId
 Wait-Process -Id $owned.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
}
& (Join-Path $studioRoot 'start.ps1')
for($attempt=0;$attempt -lt 50;$attempt++){
 try{$response=Invoke-WebRequest -Uri ('http://127.0.0.1:'+ $targetPort +'/') -UseBasicParsing -TimeoutSec 2;if($response.StatusCode -eq 200){Write-Output ('PWA HTTP ready: '+$targetPort);exit 0}}catch{}
 Start-Sleep -Milliseconds 200
}
throw 'PWA did not return HTTP 200 after deployment'
