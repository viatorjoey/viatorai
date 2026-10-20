$ErrorActionPreference='Stop'
$launchState=@{count=0}
function Get-NetTCPConnection {[CmdletBinding()]param([int]$LocalPort,[string]$State)}
function Get-CimInstance {param([string]$ClassName,[string]$Filter)}
function Stop-Process {throw 'Offline recovery must not terminate any process'}
function Start-Process {[CmdletBinding()]param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,$RedirectStandardOutput,$RedirectStandardError,[switch]$PassThru)
 if(([string]$FilePath).Replace('\','/') -notlike '*ComfyUI/.venv/Scripts/python.exe' -or $ArgumentList -notmatch 'ComfyUI\\main.py' -or $WindowStyle -ne 'Hidden'){throw 'Unexpected launch command'}
 $launchState.count++;[pscustomobject]@{Id=9999}
}
& (Join-Path $PSScriptRoot '../comfy-process.ps1') -Action restart -ExpectedPid 0
if($launchState.count -ne 1){throw 'Expected one verified launch'}
Write-Output 'PASS actual PowerShell offline branch: no stop calls, one hidden launch from verified stored profile.'
