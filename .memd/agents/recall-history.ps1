$env:MEMD_BUNDLE_ROOT = "/run/media/josue/T7/projects/clawcontrol/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
$args = @("lookup", "--output", $env:MEMD_BUNDLE_ROOT, "--route", "project_first", "--intent", "general")
$args += @("--kind", "fact")
$args += @("--kind", "decision")
$args += @("--kind", "status")
memd @args @Args
