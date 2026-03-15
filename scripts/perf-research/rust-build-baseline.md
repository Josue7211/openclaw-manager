# Rust Build Baseline — Mission Control

**Measured:** 2026-03-15
**Platform:** Linux (CachyOS), x86_64

## Metrics

| Metric | Value |
|---|---|
| Clean build time | **TBD — run `bash scripts/perf-research/measure-rust-build.sh`** |
| Incremental (no changes) | 0.21s |
| Debug binary size | 398 MB |
| Total crates (Cargo.lock) | 681 |
| Direct dependencies (Cargo.toml) | 33 |
| Rust source files | 50 |
| Rust source lines | 14,865 |
| target/ directory size | 20 GB |

## Direct Dependencies (33)

Heavy compile-time crates (known slow builders):
- **tauri** v2 + tray-icon — pulls in webkit2gtk, gtk, glib, gdk, pango on Linux
- **sqlx** v0.7 — runtime-tokio + sqlite + chrono (compile-time query checking)
- **reqwest** v0.12 — json + stream + rustls-tls (pulls in ring, rustls, h2, hyper)
- **tokio** v1 — full feature set (all sub-crates)
- **image** v0.25 — jpeg + png decoders
- **regex** v1 — compiles Unicode tables
- **tokio-tungstenite** v0.21 — native-tls (OpenSSL bindings)
- **async-imap** v0.9 + **async-native-tls** v0.5 — email support

Lightweight crates:
- serde, serde_json, chrono, rand, hex, dirs, anyhow, tracing, tracing-subscriber
- axum, axum-extra, tower, tower-http, futures, async-stream, tokio-stream
- keyring, ical, tokio-util, dotenvy, url

## Known Slow Crates (expected from dependency graph)

Based on the 681 total crates and the dependency profile, the expected slowest to compile are:
1. **webkit2gtk / gtk / glib** — Linux GUI bindings, lots of FFI code generation
2. **ring** — cryptography, assembly compilation
3. **sqlx** — macro expansion for compile-time checked queries
4. **image** — codec implementations
5. **reqwest + hyper + h2** — HTTP stack with TLS

## Build Profile

No custom `[profile.dev]` or `[profile.release]` settings in Cargo.toml.
Using default Rust debug profile (unoptimized + debuginfo → 398 MB binary).

## Optimization Opportunities

### High impact
1. **Add `[profile.dev]` optimizations for dependencies:**
   ```toml
   [profile.dev.package."*"]
   opt-level = 1  # Optimize deps but not own code — faster runtime, same compile speed
   ```
2. **Split features on heavy crates:**
   - `tokio`: change `"full"` to only needed features (rt-multi-thread, macros, net, io-util, time, fs, sync, signal)
   - `image`: already scoped to jpeg+png — good
3. **Consider `cargo-chef` or `sccache`** for CI/CD caching
4. **Use `lld` linker** (already installed at `/usr/bin/lld`) — linking a 398 MB binary with the default `ld` is slow. No `.cargo/config.toml` exists yet:
   ```toml
   # src-tauri/.cargo/config.toml
   [target.x86_64-unknown-linux-gnu]
   rustflags = ["-C", "link-arg=-fuse-ld=lld"]
   ```
   Alternatively install `mold` for even faster linking.

### Medium impact
5. **Evaluate if `async-imap` + `async-native-tls` are needed** — email/IMAP pulls in OpenSSL + TLS stack. If not used yet, feature-gate it
6. **`ical` crate** — calendar parsing could be lazy-loaded or feature-gated
7. **20 GB target directory** — consider periodic `cargo clean` or setting `CARGO_TARGET_DIR` to a tmpfs

### Low impact (diminishing returns)
8. **Replace `regex` with `regex-lite`** if full Unicode support isn't needed
9. **Reduce debug info**: `[profile.dev] debug = 1` (line tables only, not full debuginfo) — shrinks binary and speeds linking

## How to Measure

Run from project root:
```bash
bash scripts/perf-research/measure-rust-build.sh
```

This cleans, rebuilds with `--timings`, and prints the results.
The HTML timing report is saved to `src-tauri/target/cargo-timings/cargo-timing.html`.
