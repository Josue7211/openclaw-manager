$env:MEMD_BUNDLE_ROOT = "/run/media/josue/T7/projects/clawctrl/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
$args = @("checkpoint", "--output", $env:MEMD_BUNDLE_ROOT, "--tag", "basic-memory", "--tag", "short-term")
memd @args @Args
