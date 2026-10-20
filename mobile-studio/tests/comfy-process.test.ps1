$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../comfy-process.ps1')
$now=Get-Date
$desktop=[pscustomobject]@{ProcessId=1;ExecutablePath=$desktopPath}
$launcher=[pscustomobject]@{ProcessId=2;ParentProcessId=1;ExecutablePath=$launcherPython;CommandLine='python -s ComfyUI\main.py --enable-manager';CreationDate=$now.AddMinutes(-10)}
$engine=[pscustomobject]@{ProcessId=3;ParentProcessId=2;ExecutablePath=$expectedPython;CommandLine=$launcher.CommandLine;CreationDate=$launcher.CreationDate}
$all=@($desktop,$launcher,$engine);$listener=@([pscustomobject]@{OwningProcess=3});$stats=@{system=@{comfyui_version='test'}};$queue=@{queue_running=@();queue_pending=@()}
function Expect($Actual,$Wanted){if($Actual -ne $Wanted){throw "Expected $Wanted, got $Actual"}}
Expect (Get-EngineState $all $listener $stats $queue).state 'ready'
Expect (Get-EngineState $all $listener $stats $queue).desktopOwned $true
Expect (Get-EngineState $all $listener $stats @{queue_running=@(@(1,'p'));queue_pending=@()}).state 'busy'
Expect (Get-EngineState $all $listener $stats @{queue_running=@();queue_pending=@(@(1,'p'))}).state 'busy'
Expect (Get-EngineState $all @() $null $null).state 'unresponsive'
$engine.CreationDate=$now
Expect (Get-EngineState $all @() $null $null).state 'starting'
Expect (Get-EngineState @($desktop) @() $null $null).state 'stopped'
Expect (Get-EngineState $all @([pscustomobject]@{OwningProcess=99}) $stats $queue).state 'foreign'
Expect (Get-EngineState $all $listener $stats @{}).apiReady $false
Expect (Get-EngineState @($launcher,$engine) $listener $stats $queue).desktopOwned $false
Expect (Get-EngineState $all $listener @{} $queue).apiReady $false
$launcher.CommandLine='python -s ComfyUI\main.py'
Expect (Get-EngineState $all $listener $stats $queue).desktopOwned $false
$launcher.CommandLine=$engine.CommandLine
Expect (Get-EngineState $all @() $null $null).recoverable $true
Expect (Get-EngineState $all @([pscustomobject]@{OwningProcess=99}) $null $null).recoverable $false
$hold=@{expiresAt=$now.ToUniversalTime().AddMinutes(30).ToString('o')}
Expect (Apply-DesktopUpdateHold @{pid=0;recoverable=$true} $hold $now).recoverable $false
Expect (Apply-DesktopUpdateHold @{pid=3;recoverable=$true} $hold $now).recoverable $true
Expect (Apply-DesktopUpdateHold @{pid=0;recoverable=$true} @{expiresAt=$now.ToUniversalTime().AddSeconds(-1).ToString('o')} $now).recoverable $true
Expect (Apply-DesktopUpdateHold @{pid=0;recoverable=$true} @{expiresAt='invalid'} $now).recoverable $true
$script:snapshot=@{pid=3;started='boot';state='foreign';recoverable=$false}
function Get-EngineSnapshot {return $script:snapshot}
try{Invoke-DesktopRestart 3 'old';throw 'identity guard did not reject'}catch{if($_ -match 'identity guard did not reject'){throw}}
try{Invoke-DesktopRestart 3 'boot';throw 'foreign guard did not reject'}catch{if($_ -match 'foreign guard did not reject'){throw}}
'PowerShell classification and recovery guards passed'
