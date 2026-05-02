# memd Hook Kit

These scripts are the default agent loop integration for `memd`.

Use them when a client wants:

- a bundle-backed resume snapshot before work starts
- durable spill at a compaction boundary
- a single stable path into the memory manager

For per-project bootstrap, use:

```bash
memd init --project <project> --namespace <namespace> --agent <agent>
```

Check bundle health with:

```bash
memd status --output .memd
```

Resume the default memory snapshot from the bundle:

```bash
memd resume --output .memd
```

Force a manual refresh of the same bootstrap path in an existing session:

```bash
memd refresh --output .memd
```

That also refreshes:

- `.memd/MEMD_MEMORY.md`
- `.memd/agents/CODEX_MEMORY.md`
- `.memd/agents/CLAUDE_CODE_MEMORY.md`
- `.memd/agents/CLAUDE_IMPORTS.md`
- `.memd/agents/OPENCLAW_MEMORY.md`
- `.memd/agents/OPENCODE_MEMORY.md`

Persist a memory into the same bundle lane:

```bash
memd remember --output .memd --kind decision --content "Store the outcome worth keeping."
```

Emit a shared handoff and refresh the same markdown memory files with shared
lane/source information:

```bash
memd handoff --output .memd
```

Agent-specific bundle entrypoints are generated under `.memd/agents/`:

- `codex.sh`
- `claude-code.sh`
- `openclaw.sh`
- `opencode.sh`

For Claude Code, import `.memd/agents/CLAUDE_IMPORTS.md` from project
`CLAUDE.md` and verify it with `/memory`.

## Environment

Set:

- `MEMD_BASE_URL` - defaults to `http://127.0.0.1:8787`
- `MEMD_PROJECT` - required for context fetches
- `MEMD_NAMESPACE` - optional namespace lane inside the project
- `MEMD_AGENT` - required for context fetches
- `MEMD_ROUTE` - defaults to `auto`
- `MEMD_INTENT` - defaults to `current_task`
- `MEMD_WORKSPACE` - optional shared workspace lane
- `MEMD_VISIBILITY` - optional `private|workspace|public`
- `MEMD_LIMIT` - defaults to `8`
- `MEMD_MAX_CHARS` - defaults to `280`
- `MEMD_RAG_URL` - optional; bundle backend config can supply this when present

## Context Hook

```bash
./memd-context.sh
```

This now calls `memd resume --prompt` under the bundle defaults and defaults the
intent to `current_task` instead of only the older generic compact-context
surface.

The installed `memd-hook-context` shim now routes through this script, so the
default installed hook path also gets the richer resume snapshot.

The prompt output now also includes a lightweight context-budget estimate and
pressure signal so the default hook path can warn when bundle resume is getting
too bloated for an efficient fresh session.

## Install on Unix

```bash
./install.sh
```

Optional:

- `MEMD_BIN=/path/to/memd ./install.sh`

## Spill Hook

```bash
./memd-spill.sh --stdin --apply < compaction.json
```

## Install on Windows

```powershell
./install.ps1
```

Optional:

- `$env:MEMD_BIN = "C:\\path\\to\\memd.exe"`
