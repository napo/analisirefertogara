#[cfg(desktop)]
mod oauth;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Opens download links in the system browser (update notice on Android / iOS)
        .plugin(tauri_plugin_opener::init())
        // "Save as" dialog and writing of the chosen file (PDF report, archive)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Requests to the cloud service chosen by the user (synchronisation), only after the user connects it
        .plugin(tauri_plugin_http::init())
        // Google sign-in on Android (plugins/google-auth); it does nothing elsewhere
        .plugin(tauri_plugin_google_auth::init());

    // Automatic updates, always confirmed by the user in the app (desktop only)
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(oauth::Pending::default())
        .invoke_handler(tauri::generate_handler![oauth::oauth_listen, oauth::oauth_wait]);

    builder
        .run(tauri::generate_context!())
        .expect("Impossibile avviare Referto Volley");
}
