$env:MEMD_BUNDLE_ROOT = "/home/josue/Documents/projects/clawcontrol/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
$args = @("hook", "capture", "--output", $env:MEMD_BUNDLE_ROOT, "--summary")
$args += @("--tag", "basic-memory", "--tag", "live-capture", "--promote-kind", "live_truth")
memd @args @Args
