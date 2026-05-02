# memd memory [tab=none]

## Scope

- project: `clawcontrol`
- namespace: `main`
- agent: `codex@session-008f3488`
- session: `session-008f3488`
- tab: `none`
- effective agent: `codex@session-008f3488`
- workspace: `none`
- visibility: `all`
- route: `auto`
- intent: `current_task`
- bundle: `/home/josue/Documents/projects/clawcontrol/.memd`


## Budget

- tok=1818 | ch=7270 | p=high | dup=0 | use=1540/1600 | refresh=true | action="resolve rehydration backlog before the next prompt"
- drivers=refresh,rehydration,tokens

## Durable Truth

- id=65027bd0-cb0d-418a-80c6-26a1e7ace0e8 | stage=canonical | scope=local | kind=live_truth | status=active | project=clawcontrol | ns=main | vis=private | age...
- id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=c...
- id=774f6590-93d0-4aaa-af11-aee48de50e8f | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=c...
- (+5 more)

## Read First

- doing=id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f348...
- left_off=On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model fixes are applied unless the deploy/runtime has actually bee...
- changed=file_edited: .cargo/config.toml
- next=id=5966b9c1-6c36-4aca-acf7-a543362923b0 | stage=canonical | scope=project | kind=preference | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-0...
- blocker=On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model fixes are applied unless the deploy/runtime has actually bee...
- t=rolling_brief: focus id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | cf=0.70 | upd=1777736236 | c=LightRA... | rolling_brief: blocker On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model fixes are applied unless the deploy/runtime has actually been updated and verified. | rolling_brief: next id=5966b9c1-6c36-4aca-acf7-a543362923b0 | stage=canonical | scope=project | kind=preference | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | cf=0.70 | upd=1777747937 | c=U... | rolling_brief: event file_edited: .cargo/config.toml
- focus=id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawc...
- next=preference: id=5966b9c1-6c36-4aca-acf7-a543362923b0 | stage=canonical | scope=project | kind=preference | status=active | project...
- blocker=Fact/Stale: On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model ...

## Voice

- default: `caveman-lite`
- no filler/hedging, keep articles + full sentences
- professional but tight
- keep exact technical terms


## Memory Objects

- context id=65027bd0 record="id=65027bd0-cb0d-418a-80c6-26a1e7ace0e8 | stage=canonical | scope=local | kind=live_truth | status=active | project=c..."
- [open](items/context/context-01-d5dd20cc)
- working id=ecadde11 record="id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawc..."
- [open](items/working/working-01-b9520820)
- inbox id=01671bec kind=fact type=semantic+canonical status=stale stage=canonical cf=0.70 scope=project source=codex@session-008f3488 / memd note="On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model ..."
- [open](items/inbox/inbox-01-eba1f0fd)
- inbox_reasons=stale, low-confidence
- recovery id=5966b9c1 kind=working_memory_record label="preference" source=codex@session-008f3488 / memd reason="evicted_by_budget;kind=Preference;status=active;source=canonical;source_trust=0.59;freshness_days=0;verified_days=45;..."
- [open](items/recovery/recovery-01-252ab365)
- semantic none
- workspace project=clawcontrol namespace=main workspace=none visibility=private items=18 active=18 contested=0 trust=0.64 cf=0.73
- [open](items/workspace/workspace-01-4066a69b)

## E+LT

- - E=file_edited: .cargo/config.toml | file_edited: .env.example | - LT=status M .cargo/config.toml | status M .env.example

## W

- w=id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | cf=0.70 | upd=1777736236 | c=LightRA... | id=774f6590-93d0-4aaa-af11-aee48de50e8f | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | cf=0.70 | upd=1777748779 | c=User cu... (+5 more)

## RI

- r=preference:id=5966b9c1-6c36-4aca-acf7-a543362923b0 | stage=canonical | scope=project | kind=preference | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | cf=0.70 | upd=1777747937 | c=U... | r=preference:id=f982f2f1-b6fe-427c-b3f1-d62e820e0b05 | stage=canonical | scope=project | kind=preference | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | cf=0.70 | upd=1777747575 | c=F... | r=preference:id=c592be33-f8e6-4a69-b76b-1582abd83839 | stage=canonical | scope=project | kind=preference | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | cf=0.70 | upd=1777747066 | c=F... | r=preference:id=dd67e4a7-ce94-44a4-a2f0-d37b708ec4a6 | stage=canonical | scope=project | kind=preference | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | lane=design | cf=0.70 | upd=17... | i=Fact/Stale:On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model fixes are applied unless the deploy/runtime has actually been updated and verified. | r=stale, low-confidence

## L

- l=clawcontrol/main/none | v=private | it=18 | tr=0.64

## Hive

- queen=none roster=1 active=1 review=0 overlap=0 stale=0
- active_bees=Clawcontrol Codex 008f3488(session-008f3488)/none
- focus=Clawcontrol Codex 008f3488 work="c=LightRA..." touches=project next="c=LightRA..." action=coordinate_now

## Event Compiler

- live event log: [events.md](events.md)
- compiled event pages: [compiled/events/latest.md](compiled/events/latest.md)
- memory updates now flow through the event compiler before the visible pages refresh

## Memory Pages

- [Context](compiled/memory/context.md)
- [Working](compiled/memory/working.md)
- [Inbox](compiled/memory/inbox.md)
- [Recovery](compiled/memory/recovery.md)
- [Semantic](compiled/memory/semantic.md)
- [Workspace](compiled/memory/workspace.md)

## Capability Registry

- discovered_capabilities: 697
- universal: 39
- bridgeable: 0
- harness_native: 658

## Capability Bridges

- bridged: 0
- already_bridged: 483
- available: 0
- blocked: 62

### Recent bridge actions

- opencode / codex:system--imagegen -> /home/josue/.config/opencode/command/system--imagegen.md (already-bridged)
- opencode / codex:system--openai-docs -> /home/josue/.config/opencode/command/system--openai-docs.md (already-bridged)
- opencode / codex:system--plugin-creator -> /home/josue/.config/opencode/command/system--plugin-creator.md (already-bridged)
- opencode / codex:system--skill-creator -> /home/josue/.config/opencode/command/system--skill-creator.md (already-bridged)
- opencode / codex:system--skill-installer -> /home/josue/.config/opencode/command/system--skill-installer.md (already-bridged)
- opencode / codex:autodream -> /home/josue/.config/opencode/command/autodream.md (already-bridged)
- opencode / codex:autoplan -> /home/josue/.config/opencode/command/autoplan.md (already-bridged)
- opencode / codex:autoresearch -> /home/josue/.config/opencode/command/autoresearch.md (already-bridged)
