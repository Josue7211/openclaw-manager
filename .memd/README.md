# memd bundle

This directory contains the memd configuration for `clawcontrol`.

## Quick Start

1. Check readiness:
   - `cargo run -p memd-client --bin memd -- status --output /home/josue/Documents/projects/clawcontrol/.memd`
2. Launch an agent profile:
   - `.memd/agents/codex.sh`
   - `.memd/agents/claude-code.sh`
   - `.memd/agents/openclaw.sh`
   - `.memd/agents/opencode.sh`
3. Resume the compact local working set:
   - `cargo run -p memd-client --bin memd -- resume --output /home/josue/Documents/projects/clawcontrol/.memd --intent current_task`

## Notes

- `env` and `env.ps1` export the same bundle defaults if you want to wire another harness manually.
- Automatic short-term capture is enabled by default and writes bundle state under `state/last-resume.json`.
- Add `--semantic` only when you want deeper LightRAG fallback.
- For Claude Code, import `.memd/agents/CLAUDE_IMPORTS.md` from your project `CLAUDE.md`, then use `/memory` to verify the memd files are loaded.
