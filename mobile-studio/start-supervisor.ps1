$ErrorActionPreference='Stop'
$studioRoot=$PSScriptRoot
$configPath=Join-Path $studioRoot 'data/supervisor-config.json'
$config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$nodePath=$config.node
if(!(Test-Path -LiteralPath $nodePath)){throw 'Configured Node.js executable not found'}
do{
 & $nodePath (Join-Path $studioRoot 'supervisor.mjs') --config $configPath
 $studioExitCode=$LASTEXITCODE
 if($studioExitCode -eq 0){exit 0}
 Add-Content -LiteralPath (Join-Path $studioRoot 'data/supervisor-launcher.log') -Value ((Get-Date -Format o)+' supervisor exited; restarting in 5 seconds')
 Start-Sleep -Seconds 5
}while($true)
