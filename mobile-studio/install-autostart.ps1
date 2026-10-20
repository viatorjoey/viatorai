$ErrorActionPreference='Stop'
$studioRoot=$PSScriptRoot
$dataPath=Join-Path $studioRoot 'data'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$nodePath=(Get-Command node -ErrorAction Stop).Source
@{node=$nodePath} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataPath 'supervisor-config.json') -Encoding utf8
$launcher=Join-Path $studioRoot 'start-supervisor.ps1'
$arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$launcher+'"'
$identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
try{
 $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $studioRoot
 $trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity
 $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
 $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
 Register-ScheduledTask -TaskName 'AI Creator Studio Supervisor' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Starts Studio after Windows login and restores crashed Node servers; leaves ComfyUI and active generation untouched.' -Force | Out-Null
 Start-ScheduledTask -TaskName 'AI Creator Studio Supervisor'
 Write-Output 'Installed: per-user login task; supervisor failure restart after 1 minute.'
}catch{
 # No elevation is needed: the same user can always install their own Startup entry.
 $vbsPath=Join-Path $studioRoot 'data/studio-autostart.vbs'
 $command='powershell.exe '+$arguments
 $safeCommand=$command.Replace('"','""')
 @('Set shell = CreateObject("WScript.Shell")','Do','  result = shell.Run("'+$safeCommand+'", 0, True)','  If result = 0 Then Exit Do','  WScript.Sleep 5000','Loop') | Set-Content -LiteralPath $vbsPath -Encoding Unicode
 $startup=[Environment]::GetFolderPath('Startup')
 $shell=New-Object -ComObject WScript.Shell
 $shortcut=$shell.CreateShortcut((Join-Path $startup 'AI Creator Studio.lnk'))
 $shortcut.TargetPath=Join-Path $env:WINDIR 'System32/wscript.exe';$shortcut.Arguments='"'+$vbsPath+'"';$shortcut.WorkingDirectory=$studioRoot;$shortcut.WindowStyle=7;$shortcut.Description='AI Creator Studio automatic startup and recovery';$shortcut.Save()
 Start-Process -FilePath $shortcut.TargetPath -ArgumentList $shortcut.Arguments -WindowStyle Hidden
 Write-Output 'Installed: current-user Startup shortcut with automatic supervisor recovery.'
}
