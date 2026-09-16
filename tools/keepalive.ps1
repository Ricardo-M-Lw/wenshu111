<#
  问数星途 · 本机保活脚本（Windows）
  --------------------------------------------------------------------------
  作用：定时访问线上 /api/health，让 Render 免费实例一直醒着，别人打开秒开。

  用法（任选一种）：
    1) 一直挂着跑：      powershell -ExecutionPolicy Bypass -File tools\keepalive.ps1
    2) 只探一次自检：    powershell -ExecutionPolicy Bypass -File tools\keepalive.ps1 -Once
    3) 装成开机自启任务：powershell -ExecutionPolicy Bypass -File tools\keepalive.ps1 -InstallTask
       卸载任务：        powershell -ExecutionPolicy Bypass -File tools\keepalive.ps1 -RemoveTask

  说明：云端保活优先用仓库里的 .github/workflows/keepalive.yml（不用开电脑）。
        这个脚本适合「本机演示前先把实例叫醒」或不想用 GitHub Actions 的场景。
#>
[CmdletBinding()]
param(
  [string]$Url = 'https://wenshu-xingtu.onrender.com/api/health',
  [int]$IntervalMinutes = 10,
  [int]$TotalMinutes = 0,
  [switch]$Once,
  [switch]$InstallTask,
  [switch]$RemoveTask
)

$ErrorActionPreference = 'Continue'
$taskName = 'WenshuXingtuKeepAlive'

function Invoke-Ping {
  $stamp = Get-Date -Format 'MM-dd HH:mm:ss'
  try {
    $res = Invoke-WebRequest -Uri $Url -TimeoutSec 90 -UseBasicParsing
    Write-Host "[$stamp] HTTP $($res.StatusCode) 保活成功" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "[$stamp] 探测失败：$($_.Exception.Message)" -ForegroundColor Yellow
    return $false
  }
}

if ($RemoveTask) {
  try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "已删除计划任务 $taskName" -ForegroundColor Green
  } catch {
    Write-Host "没有找到计划任务 $taskName" -ForegroundColor Yellow
  }
  exit 0
}

if ($InstallTask) {
  $arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -IntervalMinutes ' + $IntervalMinutes
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description '问数星途 Render 实例保活' -Force | Out-Null
  Write-Host "已装好开机自启任务 $taskName（登录后自动每 $IntervalMinutes 分钟探一次）" -ForegroundColor Green
  exit 0
}

if ($Once) {
  if (Invoke-Ping) { exit 0 } else { exit 1 }
}

$deadline = $null
if ($TotalMinutes -gt 0) { $deadline = (Get-Date).AddMinutes($TotalMinutes) }
Write-Host "开始保活：$Url"
Write-Host "每 $IntervalMinutes 分钟探一次，按 Ctrl+C 停止" -ForegroundColor Cyan
while ($true) {
  Invoke-Ping | Out-Null
  if ($deadline -and (Get-Date) -ge $deadline) { break }
  Start-Sleep -Seconds ($IntervalMinutes * 60)
}
