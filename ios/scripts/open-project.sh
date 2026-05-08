#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
find ios -name '._*' -delete
mkdir -p /Volumes/T7/XcodeDerivedData

if [ -d /Applications/Xcode.app ]; then
  sudo xcode-select --switch /Applications/Xcode.app
  sudo xcodebuild -license accept || true
  xcodebuild -runFirstLaunch || true
fi

open ios/ClawControl.xcodeproj
