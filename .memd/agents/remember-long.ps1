$env:MEMD_BUNDLE_ROOT = "/home/josue/Documents/projects/clawcontrol/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
$args = @("remember", "--output", $env:MEMD_BUNDLE_ROOT, "--kind", "fact", "--scope", "project")
$args += @("--tag", "basic-memory")
$args += @("--tag", "long-term")
memd @args @Args
