// SPDX-FileCopyrightText: 2026 Maurizio Napolitano <maurizio.napolitano@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Commands of the Kotlin plugin, called from the web view (src/sync/auth-android.ts).
const COMMANDS: &[&str] = &["authorize", "clear"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
