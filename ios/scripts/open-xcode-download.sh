#!/usr/bin/env bash
set -euo pipefail

mkdir -p /Volumes/T7/AppleDevDownloads /Volumes/T7/XcodeDerivedData

echo "Opening official Apple Xcode download pages."
echo "Save any .xip download to: /Volumes/T7/AppleDevDownloads"
open "https://developer.apple.com/support/xcode/"
open "https://developer.apple.com/download/all/?q=Xcode%2026.3"
open "macappstore://apps.apple.com/us/app/xcode/id497799835"
