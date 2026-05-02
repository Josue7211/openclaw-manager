# Career Ops Design

Date: 2026-04-09
Status: Draft approved in conversation, pending written-spec review
Owner: Codex

## Summary

ClawControl's current `Job Hunter` feature should evolve into `Career Ops`: a private AI career operating system for urgent active job search, with a path to support quieter job discovery while employed later.

The product should not center on job feeds. Feeds are only intake. The product centers on an `opportunity dossier` that helps the user decide whether to pursue a role, prepare tailored application assets quickly, track the workflow, and reuse learning across similar roles.

The 10-star vision is:

> A private AI career chief of staff that finds, filters, prepares, tracks, and improves every career move for you.

The approved v1 is the smallest version of that vision that creates real user value:

- intake from live search results or pasted JD/URL/text
- structured evaluation and pursue/hold/skip recommendation
- tailored application asset generation
- dossier-based tracking, next actions, and interview prep

Non-goals for v1 include auto-apply, broad ATS automation, negotiation tooling, and autonomous action without human review.

## Product Thesis

`Career Ops` should satisfy three promises at once:

1. Help the user get hired faster.
2. Help the user choose better opportunities.
3. Run the search as an operating system rather than a loose collection of tools.

For the first release, the product should optimize for `urgent active search` when tradeoffs appear. This means:

- small, ranked queues over exhaustive browsing
- fast decision support over crawler breadth
- application readiness over passive analytics
- clear next actions over flexible but vague tracking

The longer-term product must also support employed users who want background discovery, but that is phase-two expansion, not the v1 center of gravity.

## 10-Star Product

The 10-star version of Career Ops:

- continuously watches saved searches, target companies, and ATS portals
- ranks opportunities against the user's real career strategy, not generic keywords
- generates a full pursuit packet: resume variant, cover note, recruiter message, referral ask, interview story pack
- manages follow-ups, interview loops, debriefs, offer comparison, and negotiation prep
- learns from outcomes over time, including which narratives, companies, and role families convert best
- adapts to two operating modes:
  - urgent active search
  - quiet background search while employed

This should feel like a private career chief of staff embedded inside ClawControl.

## V1 Product Boundary

V1 should include:

- live search intake from the existing public job feed integration
- manual intake from pasted job description text, pasted URL, or manually entered role details
- automatic dossier creation for every pursued opportunity
- structured fit evaluation against a configurable user profile
- recommendation state:
  - pursue
  - hold
  - skip
- generated assets:
  - tailored resume bullet suggestions
  - short cover note
  - recruiter or referral outreach blurb
  - interview prep prompts
- workflow tracking:
  - stage
  - due date
  - next action
  - notes
  - timeline

V1 should not include:

- auto-submitting forms
- browser automation across arbitrary ATS portals
- negotiation-specific workflows
- automatic strategy learning loops that rewrite user strategy without review
- autonomous agents taking irreversible actions

## Core Domain Model

The system should revolve around one durable object: the `opportunity dossier`.

Each dossier should contain:

- normalized opportunity data
  - company
  - role
  - location
  - source
  - source URL
  - compensation text
  - estimated hourly rate
  - posting freshness
- decision data
  - fit score
  - recommendation
  - reasons to pursue
  - reasons to avoid
  - risks and missing proof points
  - urgency
- generated assets
  - tailored resume bullets
  - cover note
  - outreach blurb
  - interview prep prompts
- workflow state
  - stage
  - due date
  - next action
  - reminders
  - notes
  - timeline entries
- learning data
  - outcome
  - callback quality
  - rejection reason if known
  - asset version used

This model matters because it keeps the product coherent. Search, evaluation, generation, and tracking all attach to the same object instead of becoming disconnected tabs and helper widgets.

## System Architecture

The architecture should be organized into five layers:

### 1. Intake Layer

Responsible for creating or refreshing dossiers.

V1 inputs:

- existing public feed search from `src-tauri/src/routes/jobs.rs`
- pasted JD text
- pasted URL
- manual role entry

Later expansion:

- target company watchlists
- ATS scanner adapters
- recruiter email ingestion

### 2. Decision Layer

Responsible for structured evaluation.

It should evolve the current heuristic scoring in `frontend/src/pages/job-hunter-domain.ts` into a richer evaluator that produces:

- numeric fit score
- recommendation state
- rationale
- risk flags
- compensation commentary
- evidence gaps

The evaluator must explain itself concretely. Generic black-box scoring will not be trusted.

### 3. Asset Layer

Responsible for generating tailored pursuit materials from dossier facts plus user profile data.

V1 asset types:

- resume bullet suggestions
- short cover note
- referral or recruiter outreach blurb
- interview story prompts

All generated content must remain editable by the user.

### 4. Workflow Layer

Responsible for moving the user through the search process.

V1 workflow responsibilities:

- queue ordering
- stage tracking
- deadlines
- reminders
- action list generation
- activity timeline

### 5. Learning Layer

Responsible for recording what happened and enabling better future recommendations.

In v1 this should be mostly data capture, not autonomous optimization. The schema should anticipate learning, but the product should not overclaim intelligence before enough signal exists.

## Experience Design

The product should feel like a war room, not a spreadsheet.

### Primary Surfaces

#### Opportunity Queue

The top-level ranked list of opportunities that need attention.

Each item should surface:

- company
- role
- score
- recommendation
- freshness
- pay signal
- source
- short rationale

This replaces the emotional posture of "browse jobs forever" with "decide what deserves time now."

#### Dossier View

The dossier is the core product surface.

Sections:

- overview
- fit assessment
- risk flags
- generated assets
- stage tracker
- next actions
- notes and timeline

#### Action Queue

A compact operational list of today's tasks:

- tailor resume
- apply
- send follow-up
- prep for interview
- archive stale lead

#### Search / Intake

Two simple intake paths:

- search live feeds
- paste JD/URL/text

Both should funnel into the same dossier creation flow.

#### Profile / Strategy

A settings area that stores the user's targeting strategy, such as:

- desired role families
- pay floor
- location flexibility
- experience proof points
- preferred narrative
- search urgency

This profile should power evaluation and asset generation.

## Current Codebase Mapping

Existing strengths to preserve:

- public job feed search in `src-tauri/src/routes/jobs.rs`
- current ranked search UI in `frontend/src/pages/JobHunter.tsx`
- existing scoring and recommendation helpers in `frontend/src/pages/job-hunter-domain.ts`
- local-first persistence patterns via local storage

Current weaknesses to fix:

- split concepts: tracked leads, review queue, feedback, and saved searches are useful but fragmented
- the current product centers on live cards rather than durable opportunity records
- scoring is helpful but too lightweight to serve as the main decision engine
- generated application assets do not exist yet

Design principle for migration:

Do not preserve duplicate concepts just because they already exist. Collapse overlapping concepts into the dossier model when possible.

## Proposed Data Model Changes

Introduce a new dossier model in the frontend domain layer first, with compatibility mapping from the existing objects:

- `TrackedLead` -> dossier workflow state
- `ReviewQueueItem` -> dossier queue metadata
- `JobFeedback` -> dossier evaluation history
- `SavedSearch` -> retained as search preset, not dossier data

Recommended new top-level entities:

- `CareerProfile`
- `OpportunityDossier`
- `DossierEvaluation`
- `DossierAssetSet`
- `DossierTimelineEvent`
- `SearchPreset`

For v1, local persistence is acceptable if it follows the existing local-first approach. The model should be shaped so it can move to backend storage later without major UI rewrites.

## Recommendation Logic

The evaluator should produce:

- `pursue`
  - strong fit or high leverage opportunity
  - worth immediate time investment
- `hold`
  - some promise but missing proof, weak compensation clarity, or lower urgency
- `skip`
  - low fit, low signal, stale, or poor tradeoff

Evaluation dimensions should include:

- role fit
- compensation fit
- recency
- source quality
- skill adjacency
- location compatibility
- narrative strength
- confidence gaps

Every recommendation must list explicit reasons. The user must be able to audit the decision quickly.

## UX Guardrails

Failure modes to avoid:

- becoming just a prettier job board
- generic or fake-feeling scoring
- bland generated assets that require full rewrites
- workflow overhead during urgent search
- optimizing for more opportunities instead of better outcomes

Guardrails:

- recommendation rationale is mandatory
- skip is a first-class action
- generated text is always editable
- queue stays intentionally small and ranked
- intake should not bury the user in raw feed noise

## Success Criteria

V1 is successful if:

- a user can go from found role to application-ready packet in minutes rather than an hour
- the queue feels trustworthy enough that the user follows it
- each dossier makes the user more prepared even if they do not apply
- the app makes daily search priorities obvious

V1 is not successful if it merely increases the number of viewed postings without improving application quality or decision quality.

## Implementation Direction

Recommended implementation sequence:

1. Introduce the dossier domain model and local persistence adapter.
2. Migrate current tracked leads and review queue concepts into dossier-backed views.
3. Build the richer evaluator layer, borrowing useful ideas from `career-ops` while keeping the design local-first and ClawControl-native.
4. Add dossier UI sections for fit, risks, assets, and actions.
5. Keep existing feed search as intake.
6. Rename and reposition the feature from `Job Hunter` to `Career Ops`.

## Explicit Non-Goals For This Spec

This spec does not define:

- exact prompt wording for generated assets
- exact visual styling
- a multi-phase backend sync model
- browser automation strategy
- offer negotiation workflow details

Those should be handled in later phase planning once the dossier-centered core is approved.

## Final Recommendation

Approve the `Career Ops` direction with the dossier model as the center of the product.

This is the correct wedge because it:

- directly improves urgent-search outcomes
- creates a real reason to stay inside ClawControl
- avoids turning the feature into a noisy crawler
- leaves a clean path to the full 10-star career operating system later
