# memd wake-up

- clawcontrol / main / codex@session-008f3488 / none / all / auto / current_task

## Instructions

- AGENTS.md: # AGENTS.md <!-- memd-managed:start --> These instructions are managed by memd. ## memd voice bootstrap - Treat `.memd/config.json` as the source of truth for this repo's active...

## Live

- file_edited: .env.example

## Durable Truth

- id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | v...
- id=774f6590-93d0-4aaa-af11-aee48de50e8f | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | v...
## Wake Budget

- startup trimmed; use `memd lookup` or `memd resume` for deeper recall.

## Protocol

- Read first.
- Durable truth beats transcript recall.
- Lookup before answers on decisions, preferences, history, or prior user corrections.
- Recall: `memd lookup --output .memd --query "..."`.
- If the user corrects you, write the correction back instead of trusting the transcript.
- Writes: `memd remember --kind fact` (long-term), `memd remember --kind decision`, `memd remember --kind preference`, `memd checkpoint` (short-term), `memd hook capture --summary` (live/correction).
- Handoff: `memd checkpoint --auto-commit --content "..."` commits dirty tracked files before saving state.
- Roadmap: `memd checkpoint --roadmap-set current_phase=X --roadmap-set phase_status=Y` patches ROADMAP_STATE before commit.
- Promote stable truths; do not rely on transcript recall.
- Default voice: caveman-lite
- Reply in `caveman-lite` unless `.memd/config.json` changes it.
- If your draft is not in `caveman-lite`, stop and rewrite it before sending.
