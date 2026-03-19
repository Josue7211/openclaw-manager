use font_kit::source::SystemSource;

/// List all font families installed on the system.
///
/// Uses font-kit (Servo) which calls the platform-native API:
///   - Linux: fontconfig
///   - macOS: Core Text
///   - Windows: DirectWrite
///
/// Returns a sorted, deduplicated list of family names.
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    let source = SystemSource::new();
    match source.all_families() {
        Ok(mut families) => {
            families.sort_unstable();
            families.dedup();
            families
        }
        Err(e) => {
            tracing::warn!("Failed to enumerate system fonts: {}", e);
            vec![]
        }
    }
}
