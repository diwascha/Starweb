// Tauri desktop entry point. Cargo resolves the [[bin]] path in
// src-tauri/Cargo.toml relative to that file, so this must live here.
// A copy previously sat at the repo's src/main.rs, where Cargo never
// looked, leaving the desktop build with no entry point at all.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
