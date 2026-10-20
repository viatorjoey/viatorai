$ErrorActionPreference='Stop'
$cpuPort=11435
$markerFile=Join-Path $PSScriptRoot 'data/chat-cpu-process.json'
$ollamaBinary=Join-Path $env:LOCALAPPDATA 'Programs/Ollama/ollama.exe'
$modelsFolder=Join-Path $env:USERPROFILE '.ollama/models'
if(!(Test-Path -LiteralPath $ollamaBinary) -or !(Test-Path -LiteralPath $modelsFolder)){throw 'Installed Ollama or models not found'}
$listener=Get-NetTCPConnection -LocalPort $cpuPort -State Listen -ErrorAction SilentlyContinue
if($listener){
 if(!(Test-Path -LiteralPath $markerFile)){throw 'CPU chat port is owned by another service'}
 $marker=Get-Content -LiteralPath $markerFile -Raw | ConvertFrom-Json
 $owned=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
 if($owned.ProcessId -ne $marker.pid -or $owned.ExecutablePath -ne $ollamaBinary -or $marker.cpuOnly -ne $true){throw 'CPU chat process identity mismatch'}
 Write-Output 'CPU chat service verified';exit
}
# Only this child receives the CPU-only settings. The original GPU Ollama stays unchanged.
$settings=@{OLLAMA_HOST='127.0.0.1:11435';OLLAMA_MODELS=$modelsFolder;CUDA_VISIBLE_DEVICES='-1';ROCR_VISIBLE_DEVICES='-1';HIP_VISIBLE_DEVICES='-1';GGML_VK_VISIBLE_DEVICES='-1';OLLAMA_VULKAN='0';OLLAMA_MAX_LOADED_MODELS='1';OLLAMA_NUM_PARALLEL='1';OLLAMA_CONTEXT_LENGTH='2048';OLLAMA_KEEP_ALIVE='0';OLLAMA_NO_CLOUD='1';OLLAMA_NOPRUNE='1'}
$previous=@{}
try{
 foreach($key in $settings.Keys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process');[Environment]::SetEnvironmentVariable($key,$settings[$key],'Process')}
 $child=Start-Process -FilePath $ollamaBinary -ArgumentList 'serve' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'data/chat-cpu.log') -RedirectStandardError (Join-Path $PSScriptRoot 'data/chat-cpu-error.log') -PassThru
 @{pid=$child.Id;cpuOnly=$true;port=$cpuPort}|ConvertTo-Json -Compress|Set-Content -LiteralPath $markerFile
}finally{foreach($key in $settings.Keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')}}
Write-Output 'CPU chat service started'
