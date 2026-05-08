# ClawControl iPadOS

Native SwiftUI iPad shell for ClawControl's backend-first API.

## Open

```bash
open ios/ClawControl.xcodeproj
```

In Xcode:

1. Select the `ClawControl` target.
2. Pick your Apple Developer team under Signing & Capabilities.
3. Set the bundle identifier if you want a personal namespace.
4. Run on iPad or archive for TestFlight.

This project includes shared workspace settings that point DerivedData at:

```bash
/Volumes/T7/XcodeDerivedData
```

## Xcode Install

This Mac currently needs full Xcode, not just Command Line Tools. Apple requires an Apple Account session for direct `.xip` downloads.

Run:

```bash
ios/scripts/open-xcode-download.sh
```

Download a compatible Xcode to:

```bash
/Volumes/T7/AppleDevDownloads
```

On macOS 15.7.5, use a Sequoia-compatible Xcode from Apple's support matrix, such as Xcode 26.3 or Xcode 16.4.

After installing Xcode into `/Applications/Xcode.app`, run:

```bash
ios/scripts/open-project.sh
```

## Configure

On first launch, open Settings and enter:

- Backend URL, such as `https://clawcontrol.example.com`
- API key used as the `X-API-Key` header

The API key is stored in the iPad keychain. The app calls:

- `GET /api/health`
- `GET /api/status`
- `GET /api/status/health`
- `GET /api/missions`
- `GET /api/agents`
- `GET /api/pipeline-events`
- `POST /api/quick-capture`
- `POST /api/pipeline/spawn`

## Current Slice

- iPad split navigation
- Dashboard with backend, service, mission, and agent status
- Mission list and pipeline launcher
- Agent registry view
- Quick capture for Task, Note, Idea, and Decision
- Settings with backend URL and keychain-backed API key
