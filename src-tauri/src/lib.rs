pub mod ai;
pub mod mcp_link;
pub mod ops;
pub mod preview;
pub mod spaces;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ops::OpsState::default())
        .manage(ai::AiState::default())
        .invoke_handler(tauri::generate_handler![
            spaces::list_recents,
            spaces::create_space,
            spaces::open_space,
            spaces::save_space,
            spaces::poll_space,
            spaces::rename_space,
            spaces::delete_space,
            spaces::forget_recent,
            spaces::set_pinned,
            spaces::add_folder,
            spaces::list_folder_spaces,
            spaces::reveal_in_file_manager,
            spaces::default_space_dir,
            ops::apply_ops,
            ops::load_icon_manifest,
            ops::search_icons,
            ops::summarize_document,
            ai::ai_status,
            ai::ai_set_config,
            ai::ai_models,
            ai::ai_conversations,
            ai::ai_conversation,
            ai::ai_delete_conversation,
            ai::ai_send,
            mcp_link::mcp_config,
            preview::space_previews,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
