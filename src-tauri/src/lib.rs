mod spaces;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            spaces::list_recents,
            spaces::create_space,
            spaces::open_space,
            spaces::rename_space,
            spaces::delete_space,
            spaces::forget_recent,
            spaces::set_pinned,
            spaces::add_folder,
            spaces::list_folder_spaces,
            spaces::reveal_in_file_manager,
            spaces::default_space_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
