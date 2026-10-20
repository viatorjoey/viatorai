$ErrorActionPreference='Stop'
Start-Sleep -Seconds 2
if($env:STUDIO_API_ONLY -ne '1'){exit 1}
$webNode=$env:STUDIO_RESTART_NODE
if(!$webNode -or !(Test-Path -LiteralPath $webNode)){exit 1}
Start-Process -FilePath $webNode -ArgumentList @('"'+(Join-Path $PSScriptRoot 'server.mjs')+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'data/web-v2.log') -RedirectStandardError (Join-Path $PSScriptRoot 'data/web-v2-error.log')
