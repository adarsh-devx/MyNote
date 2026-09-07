use tauri::{Manager, RunEvent};
use tauri_plugin_notification::NotificationExt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            // Get the main window
            let window = app.get_webview_window("main").unwrap();
            
            // Check for pending notifications on startup
            let window_clone = window.clone();
            tauri::async_runtime::spawn(async move {
                // Wait a moment for the frontend to load
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                
                // The actual notification check will be handled by the frontend
                // since it needs to make authenticated API calls
                let _ = window_clone.emit("check-pending-notifications", ());
            });
            
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Prevent the app from quitting, just hide the window
                // This allows the app to continue running in the background
                // for potential future notification checks
                #[cfg(target_os = "windows")]
                {
                    window.hide().unwrap();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
