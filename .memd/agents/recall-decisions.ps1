$env:MEMD_BUNDLE_ROOT = "/home/josue/Documents/projects/clawcontrol/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
$args = @("lookup", "--output", $env:MEMD_BUNDLE_ROOT, "--route", "project_first", "--intent", "general")
$args += @("--kind", "decision")
$args += @("--kind", "constraint")
memd @args @Args
