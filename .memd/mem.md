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

- tok=1514 | ch=6055 | p=high | dup=0 | use=1540/1600 | refresh=true | action="resolve rehydration backlog before the next prompt"
- drivers=refresh,rehydration,tokens

## Durable Truth

- id=c4c3b560-39b6-4a4c-9f07-f4def21b5442 | stage=canonical | scope=local | kind=live_truth | status=active | project=memd | ns=main | vis=private | agent=memd...
- id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=c...
- id=774f6590-93d0-4aaa-af11-aee48de50e8f | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=c...
- (+1 more)

## Read First

- doing=id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f348...
- left_off=On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model fixes are applied unless the deploy/runtime has actually bee...
- changed=file_edited: .env.example
- next=id=160d447d-2194-4add-b690-900b7190e23c | stage=canonical | scope=project | kind=status | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3...
- blocker=On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model fixes are applied unless the deploy/runtime has actually bee...
- t=rolling_brief: focus id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | cf=0.70 | upd=1777736236 | c=LightRA... | rolling_brief: blocker On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model fixes are applied unless the deploy/runtime has actually been updated and verified. | rolling_brief: next id=160d447d-2194-4add-b690-900b7190e23c | stage=canonical | scope=project | kind=status | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | tags=checkpoint,current-task,auto-short-term,bundle-refresh,wake | cf=0.72 | upd=1777823094 | c=status: wake project=clawcontrol namespace=main agent=codex@session-008f3488 working=7 inbox=1 spine=7 tokens=1622 core=1163 focus="id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 / stage=canonical / scope=project / kind=fact... | rolling_brief: event file_edited: .env.example
- focus=id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawc...
- next=evicted working-set item: id=160d447d-2194-4add-b690-900b7190e23c | stage=canonical | scope=project | kind=status | status=active | project=cla...
- blocker=Fact/Stale: On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model ...

## Voice

- default: `caveman-lite`
- no filler/hedging, keep articles + full sentences
- professional but tight
- keep exact technical terms


## Memory Objects

- context id=c4c3b560 record="id=c4c3b560-39b6-4a4c-9f07-f4def21b5442 | stage=canonical | scope=local | kind=live_truth | status=active | project=m..."
- [open](items/context/context-01-4e836e2e)
- working id=ecadde11 record="id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawc..."
- [open](items/working/working-01-b9520820)
- inbox id=01671bec kind=fact type=semantic+canonical status=stale stage=canonical cf=0.70 scope=project source=codex@session-008f3488 / memd note="On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model ..."
- [open](items/inbox/inbox-01-eba1f0fd)
- inbox_reasons=stale, low-confidence
- recovery id=160d447d kind=working_memory_record label="evicted working-set item" source=none reason="evicted_by_status_cap;kind=Status;status=active;source=derived;source_trust=0.73;freshness_days=0;verified_days=45;re..."
- [open](items/recovery/recovery-01-1b3f92a0)
- semantic none
- workspace project=clawcontrol namespace=main workspace=none visibility=private items=34 active=34 contested=0 trust=0.66 cf=0.72
- [open](items/workspace/workspace-01-6cba300f)

## E+LT

- - E=file_edited: .env.example | file_edited: .memd/agents/HARNESS_BRIDGES.md | - LT=status M .env.example | status M .memd/agents/HARNESS_BRIDGES.md

## W

- w=id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | cf=0.70 | upd=1777736236 | c=LightRA... | id=774f6590-93d0-4aaa-af11-aee48de50e8f | stage=canonical | scope=project | kind=fact | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | cf=0.70 | upd=1777748779 | c=User cu... (+5 more)

## RI

- r=evicted working-set item:id=160d447d-2194-4add-b690-900b7190e23c | stage=canonical | scope=project | kind=status | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | tags=checkpoint,current-task,auto-short-term,bundle-refresh,wake | cf=0.72 | upd=1777823094 | c=status: wake project=clawcontrol namespace=main agent=codex@session-008f3488 working=7 inbox=1 spine=7 tokens=1622 core=1163 focus="id=ecadde11-93bd-4f29-8f09-b000e2ef8c28 / stage=canonical / scope=project / kind=fact... | r=livetruth:id=c4c3b560-39b6-4a4c-9f07-f4def21b5442 | stage=canonical | scope=local | kind=live_truth | status=active | project=memd | ns=main | vis=private | agent=memd | tags=live_truth,repo_changes | cf=0.98 | upd=1777822832 |... | r=livetruth:id=c24f1c02-68bb-49dc-b14d-513d125c6c1a | stage=canonical | scope=local | kind=live_truth | status=active | project=memd | ns=main | vis=private | agent=memd | tags=live_truth,repo_changes | cf=0.98 | upd=1777820439 |... | r=status:id=bff08cb0-dce9-4838-bb06-1b3831c66e10 | stage=canonical | scope=project | kind=status | status=active | project=clawcontrol | ns=main | vis=private | agent=codex@session-008f3488 | tags=checkpoint,current-task,auto-... | i=Fact/Stale:On 2026-04-18, user corrected that repo edits did not change the running OpenClaw VM; do not claim Hermes/live model fixes are applied unless the deploy/runtime has actually been updated and verified. | r=stale, low-confidence

## L

- l=clawcontrol/main/none | v=private | it=34 | tr=0.66 

## Hive

- queen=none roster=1 active=1 review=0 overlap=0 stale=0
- active_bees=Clawcontrol Codex 9d8c0073(session-008f3488)/none
- focus=Clawcontrol Codex 9d8c0073 work="c=LightRA..." touches=project next="c=LightRA..." action=coordinate_now

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
