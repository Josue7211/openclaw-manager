$env:MEMD_BUNDLE_ROOT = "/run/media/josue/T7/projects/clawctrl/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
$args = @("lookup", "--output", $env:MEMD_BUNDLE_ROOT, "--route", "project_first", "--intent", "general")
$args += @("--kind", "preference")
$args += @("--kind", "constraint")
$args += @("--kind", "decision")
$args += @("--tag", "design-memory")
memd @args @Args
