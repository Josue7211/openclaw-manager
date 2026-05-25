# memd memory

This file is maintained by `memd` for agents that do not have built-in durable memory.

## Voice

- default: `caveman-lite`
- no filler/hedging, keep articles + full sentences
- professional but tight
- keep exact technical terms

## Project bootstrap

# memd project bootstrap

This bundle was initialized from the existing project context at `/run/media/josue/T7/projects/clawcontrol`.

## Loaded sources

- ~/.claude/command/memd.md
- ~/.claude/commands/memd/init.md
- ~/.claude/commands/memd/reload.md
- ~/.claude/commands/memd/status.md
- ~/.claude/commands/memd.md
- ~/.claude/settings.json
- ~/.claude/skills/memd/SKILL.md
- ~/.claude/skills/memd-init/SKILL.md
- ~/.claude/skills/memd-reload/SKILL.md
- ~/.claude/skills/memd-status/SKILL.md
- ~/.claw/settings.json
- ~/.codex/config.toml
- ~/.codex/skills/autodream/SKILL.md
- ~/.codex/skills/dream/SKILL.md
- ~/.codex/skills/gsd-autonomous/SKILL.md
- ~/.codex/skills/gsd-map-codebase/SKILL.md
- ~/.codex/skills/memd/SKILL.md
- ~/.codex/skills/memd-init/SKILL.md
- ~/.codex/skills/memd-reload/SKILL.md
- ~/.config/claw/settings.json
- ~/.config/opencode/command/gsd-autonomous.md
- ~/.config/opencode/command/gsd-map-codebase.md
- ~/.config/opencode/command/memd.md
- ~/.config/opencode/opencode.json
- ~/.config/opencode/plugins/memd-plugin.mjs
- ~/.config/opencode/settings.json
- ~/.openclaw/workspace/AGENTS.md
- ~/.openclaw/workspace/BOOTSTRAP.md
- ~/.openclaw/workspace/HEARTBEAT.md
- ~/.openclaw/workspace/IDENTITY.md
- ~/.openclaw/workspace/SOUL.md
- ~/.openclaw/workspace/TOOLS.md
- ~/.openclaw/workspace/USER.md

Bootstrap summaries trimmed to save context. Read any source file on demand.
See `state/source-registry.json` for content hashes.

## Notes

- project: `clawcontrol`
- init agent: `claw`
- bootstrap mode: `seed_existing`
- source registry: `state/source-registry.json` with content hashes for imported files
- Add a separate import command if you need a deeper file sweep or more context than the default bootstrap budget.

## Capability Registry

- discovered_capabilities: 696
- universal: 37
- bridgeable: 0
- harness_native: 659

## Capability Bridges

- bridged: 4
- already_bridged: 481
- available: 0
- blocked: 62

### Recent bridge actions

- opencode / codex:system--imagegen -> /home/josue/.config/opencode/command/system--imagegen.md (already-bridged)
- opencode / codex:system--openai-docs -> /home/josue/.config/opencode/command/system--openai-docs.md (already-bridged)
- opencode / codex:system--plugin-creator -> /home/josue/.config/opencode/command/system--plugin-creator.md (bridged)
- opencode / codex:system--skill-creator -> /home/josue/.config/opencode/command/system--skill-creator.md (already-bridged)
- opencode / codex:system--skill-installer -> /home/josue/.config/opencode/command/system--skill-installer.md (already-bridged)
- opencode / codex:autodream -> /home/josue/.config/opencode/command/autodream.md (already-bridged)
- opencode / codex:autoplan -> /home/josue/.config/opencode/command/autoplan.md (already-bridged)
- opencode / codex:autoresearch -> /home/josue/.config/opencode/command/autoresearch.md (already-bridged)

Refresh it with:

- `memd resume --output /run/media/josue/T7/projects/clawcontrol/.memd --route auto --intent current_task`
- `memd resume --output /run/media/josue/T7/projects/clawcontrol/.memd --route auto --intent current_task --semantic`
- `memd handoff --output /run/media/josue/T7/projects/clawcontrol/.memd`
- `memd handoff --output /run/media/josue/T7/projects/clawcontrol/.memd --semantic`

## Bundle Defaults

- project: clawcontrol
- namespace: main
- agent: claw
- session: session-46fabd0c
- tab: none
- workspace: none
- visibility: all
- route: auto
- intent: current_task
- heartbeat_model: llama-desktop/qwen
- voice_mode: caveman-lite
- auto_short_term_capture: true

## Notes

- `resume` keeps the active working memory fresh on the fast local hot path.
- `handoff` adds shared workspace, source-lane, and delegation state.
- automatic short-term capture runs on compaction spill boundaries unless disabled in the bundle env/config.
- In Codex, treat installed `$gsd-*` skills as the primary GSD interface after `memd reload` (alias: `memd refresh`).
- Do not claim autonomous GSD is blocked on standalone `gsd-*` shell binaries unless you verified that interface is required for this harness and missing on `PATH`.
- If `$gsd-autonomous` is installed as a skill, try that skill path before claiming the autonomous pipeline is unavailable.
- add `--semantic` only when you want slower deep recall from the semantic backend.
- future dream/consolidation output should flow back into this same memory surface.
