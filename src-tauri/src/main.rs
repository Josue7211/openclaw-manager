#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod secrets;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            secrets::get_secret,
            secrets::set_secret,
            secrets::get_modules,
            secrets::check_first_run,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
