$env:MEMD_BUNDLE_ROOT = "/run/media/josue/T7/projects/clawctrl/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
$args = @("lookup", "--output", $env:MEMD_BUNDLE_ROOT, "--route", "project_first", "--intent", "general")
memd @args @Args
