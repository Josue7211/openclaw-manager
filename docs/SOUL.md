# SOUL: Spawn & Orchestration Unified Logic

Agent spawning protocol and PID registry management.

## Background Spawn Protocol

When Bjorn spawns a worker with `exec(background:true)`, the OS returns a bash wrapper process PID (`/bin/bash -c ...`). The actual `claude` binary runs as a child of that wrapper.

### Registry PID Resolution

**Problem**: Storing the bash wrapper PID in the registry causes mismatch — the processes API shows the wrapper at ~0% CPU and the real worker as anonymous.

**Solution**: After spawning a worker, resolve the actual `claude` child PID and register that instead:

```js
// After spawn, get child claude PID
const { execSync } = require("child_process");
let claudePid = parentPid;
try {
  // pgrep -P <pid> finds immediate children of <pid>
  claudePid = execSync(`pgrep -P ${parentPid} claude`).toString().trim() || parentPid;
} catch {}
// Register the claude child PID, not the bash wrapper
reg[claudePid] = entry;
```

### API Process Listing Logic

The `/api/processes` route:
1. **Filters bash wrappers** — Only includes `claude` binary processes, excludes `/bin/bash -c ...`
2. **Remaps stale entries** — If a registry PID isn't running, checks for its `claude` child via `pgrep -P <pid> claude` and remaps the entry

This ensures the dashboard always shows the actual worker process with correct CPU/memory data.
