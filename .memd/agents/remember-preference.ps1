$env:MEMD_BUNDLE_ROOT = "/run/media/josue/T7/projects/clawctrl/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
$args = @("remember", "--output", $env:MEMD_BUNDLE_ROOT, "--kind", "preference", "--scope", "project")
$args += @("--tag", "basic-memory")
$args += @("--tag", "preference")
memd @args @Args
