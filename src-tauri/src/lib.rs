pub mod commands;
pub mod models;

use commands::MergeState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(MergeState::default())
        .invoke_handler(tauri::generate_handler![
            commands::scan_directory,
            commands::get_files_metadata,
            commands::probe_file,
            commands::start_merge,
            commands::cancel_merge,
            commands::file_exists,
            commands::open_output_folder,
            commands::reveal_in_finder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MergeShot");
}
