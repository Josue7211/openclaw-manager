/** Extend the global Window interface with Tauri internals injected by the runtime. */
interface Window {
  __TAURI_INTERNALS__?: Record<string, unknown>
}
