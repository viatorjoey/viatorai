$ErrorActionPreference='Stop'
$studioRoot=$PSScriptRoot
New-Item -ItemType Directory -Path (Join-Path $studioRoot 'data') -Force | Out-Null
$nodePath=(Get-Command node -ErrorAction Stop).Source
if(!(Get-NetTCPConnection -LocalPort 8799 -State Listen -ErrorAction SilentlyContinue)){
    $env:STUDIO_PORT='8799';$env:STUDIO_INTERNAL_PORT='8800';$env:STUDIO_API_ONLY='1';$env:STUDIO_DATA_DIR=Join-Path $studioRoot 'data'
    Start-Process -FilePath $nodePath -ArgumentList @('"'+(Join-Path $studioRoot 'server.mjs')+'"') -WorkingDirectory $studioRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $studioRoot 'data/web-v2.log') -RedirectStandardError (Join-Path $studioRoot 'data/web-v2-error.log')
}
& docker cp (Join-Path $studioRoot 'n8n-cli-preload.cjs') n8n:/tmp/ai-creator-mobile-preload.cjs
if($LASTEXITCODE -eq 0){
if(!(Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue)){
    $env:STUDIO_PORT='8787';$env:STUDIO_INTERNAL_PORT='8788';Remove-Item Env:STUDIO_API_ONLY,Env:STUDIO_TEST_MODE,Env:STUDIO_DATA_DIR -ErrorAction SilentlyContinue
    Start-Process -FilePath $nodePath -ArgumentList @('"'+(Join-Path $studioRoot 'server.mjs')+'"') -WorkingDirectory $studioRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $studioRoot 'data/server.log') -RedirectStandardError (Join-Path $studioRoot 'data/server-error.log')
}
}else{Write-Warning 'Web is running; worker will wait for Docker. The installed supervisor retries automatically.'}
Write-Output 'AI Creator Studio: http://localhost:8799 (web), http://localhost:8787 (worker)'
