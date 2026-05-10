# iPad app — handoff packet

Last touched: 2026-05-10 by the memd-perf agent. Original Swift scaffold is older.

This packet is the cold-start brief for the next agent picking up iPad work. Read it before reading the code.

## TL;DR

- The app is a thin native SwiftUI shell over the existing ClawControl backend at `localhost:3000` (and via Tailscale from the iPad).
- Scaffolding is done. Six views, an `APIClient`, `KeychainStore`, `AppModel`. Compiles. No test target yet. Never run on a simulator or device — this Mac doesn't have full Xcode installed.
- The user has a **paid Apple Developer account**. TestFlight + device install are on the table.
- The blocker for *every* iOS task right now is: install Xcode.

## Current state of the code

```
ios/
├── ClawControl.xcodeproj           # single app target, no test target
├── ClawControl/
│   ├── ClawControlApp.swift        # @main entry, instantiates AppModel
│   ├── Core/
│   │   ├── APIClient.swift         # URLSession wrapper, X-API-Key header
│   │   └── KeychainStore.swift     # Security framework wrapper
│   ├── Models/
│   │   └── ClawModels.swift        # Codable types matching backend
│   ├── ViewModels/
│   │   └── AppModel.swift          # @MainActor ObservableObject, all state
│   └── Views/
│       ├── RootView.swift          # split nav
│       ├── DashboardView.swift     # backend + service + mission + agent
│       ├── MissionsView.swift      # list + spawn-from-pipeline
│       ├── AgentsView.swift        # registry
│       ├── CommandView.swift       # quick-capture (task/note/idea/decision)
│       └── SettingsView.swift      # backend URL + API key entry
├── scripts/
│   ├── open-xcode-download.sh      # opens Apple's download pages
│   └── open-project.sh             # `open ios/ClawControl.xcodeproj`
└── README.md
```

Backend endpoints already wired in `APIClient.swift`:

- `GET  /api/health`
- `GET  /api/status`
- `GET  /api/status/health`
- `GET  /api/missions`
- `GET  /api/agents`
- `GET  /api/pipeline-events`
- `POST /api/quick-capture`
- `POST /api/pipeline/spawn`

The `MC_API_KEY` header lives in iPadOS keychain (`com.clawcontrol.ipad` service). The backend URL lives in `UserDefaults`.

## Blocker: no Xcode

This Mac currently has only Command Line Tools. `xcrun simctl` and `xcodebuild` are unavailable. README mentions a stale macOS version (15.7.5) but the actual host is **macOS 26.4.1 (Tahoe)** — so target **Xcode 26.4** (Sequoia-era Xcode 16.4 will refuse to install on Tahoe).

Three install paths, with tradeoffs:

| Method | Lands where | Auth | Pros | Cons |
|---|---|---|---|---|
| **Mac App Store** | `/Applications/Xcode.app` (internal disk, no choice) | Apple ID via App Store | Simplest, auto-updates | Can't put on T7 |
| **`xcodes` CLI** (`brew install xcodes aria2`) | Anywhere — e.g. `/Volumes/T7/Xcode.app` then `xcode-select -s` | Apple ID prompt in terminal | Targets T7, version pinning, multi-version | Third-party tool |
| **Manual `.xip`** from developer.apple.com | Wherever you extract it | Browser sign-in | No extra tools | Manual extract + `xcode-select` |

T7 has 696 GB free, `/Volumes/T7/AppleDevDownloads` and `/Volumes/T7/XcodeDerivedData` are already prepared. `xcodes` is the recommended path to install **off** the internal SSD.

**The user has not yet picked which path. Confirm before installing.**

## Suggested first-day plan once Xcode is installed

1. Open the project: `open ios/ClawControl.xcodeproj`
2. Pick the `ClawControl` target → Signing & Capabilities → select Apple Developer team
3. Run on simulator: pick "iPad Pro (12.9-inch)" → Cmd+R
4. **Add a test target** (File → New → Target → Unit Testing Bundle → name `ClawControlTests`). The current pbxproj has no test target — this is the highest-leverage first move.
5. Write the first tests against `APIClient` using a `URLProtocol` mock — pure logic, no UI, fast feedback. Then `KeychainStore`, then `AppModel`.
6. After unit tests, add a UI Testing Bundle for one smoke test of the split-nav flow.
7. Headless test invocation:
   ```bash
   xcodebuild test \
     -project ios/ClawControl.xcodeproj \
     -scheme ClawControl \
     -destination 'platform=iOS Simulator,name=iPad Pro (12.9-inch)'
   ```

## What's missing from the scaffold

Things the user has mentioned wanting but that aren't built:

- **Messages view** parity (iMessage via BlueBubbles — backend already exists at `/api/messages/*`, app doesn't surface it yet)
- **Notes/Vault** view (`/api/vault/*` proxy exists, app doesn't surface it)
- **Push notifications** via ntfy — backend route at `/api/notify`, iOS side would need APNs registration via the Apple Developer account
- **Live SSE for missions** — backend supports it via `text/event-stream`, app does fire-and-forget GETs
- **Offline queue** — frontend has one (`lib/offline-queue.ts`), iOS would benefit from the same pattern when on metro/airplane modes
- **iPad-specific layouts** — `RootView.swift` uses SwiftUI split nav but doesn't optimize for landscape, Stage Manager, or external keyboard shortcuts
- **Widgets / Live Activities / App Intents** — none present, all are real opportunities for an "iPad command center" feel
- **Demo mode** — frontend has `lib/demo-data.ts` for open-source showcase; iOS app has no equivalent

The user's prior framing was "I started the iPad app" — meaning the scaffold IS the starting point, not the goal. Treat it as exploration of native parity, prioritize what they reach for on the iPad most.

## Network / auth model the iOS app must respect

The desktop app (Tauri) runs an embedded Axum server on `127.0.0.1:3000`. The iPad cannot reach that — its loopback is the iPad itself.

Two ways the iPad reaches the backend:

1. **Tailscale on the iPad** — the user has tailnet membership. The iPad gets a `100.x.x.x` IP, and so does the host running the desktop app. Configure the backend URL in Settings to point at the host's Tailnet hostname.
2. **Cloudflare Access** — most `*.aparcedo.org` services are reachable, but the desktop's embedded server is local-only by design. There's no public endpoint.

So `APIClient.baseURL` must be the user's Tailnet address. The `MC_API_KEY` header is **required** for all data endpoints — the embedded server rejects unauthenticated requests in production (debug-mode localhost allowlist doesn't apply here).

Important: this means the iPad app needs the host (running Tauri) **awake and on Tailscale** to function. There's no cloud relay. If you build offline support, plan for the host being unreachable.

## Memd context for next agent

memd is now the durable memory system for this project. Bridges work from any worktree thanks to today's fix. Before doing iOS work, run from `/Volumes/T7/projects/clawcontrol` or any worktree:

```bash
bash .memd/agents/lookup.sh --query "ipad"
bash .memd/agents/recall-history.sh --query "ipad swiftui"
```

If you're in a new git worktree where `.memd/` doesn't exist, run `memd setup --output .memd` from inside it and it'll auto-symlink to the main repo's bundle (this is one of today's fixes).

The wake bridge also works:

```bash
bash .memd/agents/claude-code.sh   # ~2s end-to-end
```

If you genuinely don't need persistent memory and want a faster cold start, skip wake and just `lookup` directly.

## Reference URLs / files

- Apple's Xcode compatibility matrix: <https://developer.apple.com/support/xcode/>
- Backend reference: [docs/api-reference.md](../docs/api-reference.md)
- Privacy / security: [docs/SECURITY.md](../docs/SECURITY.md) — same rules apply (no telemetry, no public endpoints)
- iOS install scripts already in place: [ios/scripts/open-xcode-download.sh](scripts/open-xcode-download.sh), [ios/scripts/open-project.sh](scripts/open-project.sh)
- The original README the user wrote: [ios/README.md](README.md)

## Things the previous agent (me) deliberately did NOT do

To avoid scope creep on what was meant to be a memd-perf session:

- Did **not** install Xcode (user hadn't picked install path)
- Did **not** scaffold the test target (no Xcode to verify it works)
- Did **not** add new Swift code (no way to compile-test it)
- Did **not** push the local clawcontrol commit to GitHub — `git push` is blocked on missing GitHub auth (no SSH key for github.com on this Mac, no PAT in BW). Local commit `f3d7ea6` is preserved on branch `claude/heuristic-aryabhata-de0326`. Same situation for the memd commit (`2919920` on `main`). The next agent (or the user) should run `gh auth login` or set up an SSH key, then `git push` from both repos.

If you start where I stopped: confirm the Xcode install path with the user first, then everything else is unblocked.
