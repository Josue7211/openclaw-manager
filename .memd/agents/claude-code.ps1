$env:MEMD_BUNDLE_ROOT = "/home/josue/Documents/projects/clawcontrol/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
if (-not $env:MEMD_TAB_ID) {
  if ($env:WT_SESSION) {
    $env:MEMD_TAB_ID = "tab-{0}" -f $env:WT_SESSION.Substring(0, [Math]::Min(8, $env:WT_SESSION.Length))
  } elseif ($env:TERM_SESSION_ID) {
    $env:MEMD_TAB_ID = "tab-{0}" -f $env:TERM_SESSION_ID.Substring(0, [Math]::Min(8, $env:TERM_SESSION_ID.Length))
  } else {
    $env:MEMD_TAB_ID = "tab-{0}" -f $PID
  }
}
$env:MEMD_AGENT = "claude-code"
$env:MEMD_WORKER_NAME = "Clawcontrol Claude 9d8c0073"
try { memd wake --output $env:MEMD_BUNDLE_ROOT --route auto --intent current_task --write | Out-Null } catch { }
Start-Process -WindowStyle Hidden -FilePath memd -ArgumentList @('heartbeat','--output',$env:MEMD_BUNDLE_ROOT,'--watch','--interval-secs','30','--probe-base-url') -RedirectStandardOutput "$env:TEMP\memd-heartbeat.log" -RedirectStandardError "$env:TEMP\memd-heartbeat.err"
try { memd hive --output $env:MEMD_BUNDLE_ROOT --publish-heartbeat --summary | Out-Null } catch { }
memd wake --output $env:MEMD_BUNDLE_ROOT --route auto --intent current_task --write
