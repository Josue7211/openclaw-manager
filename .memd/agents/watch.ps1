$env:MEMD_BUNDLE_ROOT = "/home/josue/Documents/projects/clawcontrol/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
$projectRoot = Split-Path -Parent $env:MEMD_BUNDLE_ROOT
memd watch --root $projectRoot --output $env:MEMD_BUNDLE_ROOT @Args
