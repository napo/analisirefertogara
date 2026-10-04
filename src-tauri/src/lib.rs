#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Opens download links in the system browser (update notice on Android / iOS)
        .plugin(tauri_plugin_opener::init())
        // "Save as" dialog and writing of the chosen file (PDF report, archive)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    // Automatic updates, always confirmed by the user in the app (desktop only)
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .run(tauri::generate_context!())
        .expect("Impossibile avviare Referto Volley");
}
