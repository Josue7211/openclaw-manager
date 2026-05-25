$env:MEMD_BUNDLE_ROOT = "/run/media/josue/T7/projects/clawctrl/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
$args = @("rag", "sync")
if ($env:MEMD_PROJECT) { $args += @("--project", $env:MEMD_PROJECT) }
if ($env:MEMD_NAMESPACE) { $args += @("--namespace", $env:MEMD_NAMESPACE) }
memd @args @Args
