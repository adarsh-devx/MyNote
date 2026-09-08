use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

use tauri_plugin_autostart::ManagerExt;

/// The AUMID (Application User Model ID) Windows uses to identify MyNotes
/// for toast notifications. Must match the `identifier` in tauri.conf.json.
const AUMID: &str = "com.mynotes.app";

/// Register the AUMID in the Windows Registry so that WinRT toast
/// notifications work for this unpackaged desktop app. Without this,
/// `ToastNotificationManager::CreateToastNotifierWithId` creates a notifier
/// for an identity Windows doesn't recognise, and toasts are silently
/// suppressed.
///
/// Reference: https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/send-local-toast-other-apps
#[cfg(target_os = "windows")]
fn register_aumid() {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!("SOFTWARE\\Classes\\AppUserModelId\\{AUMID}");
    if let Ok((key, _)) = hkcu.create_subkey_with_flags(&path, KEY_WRITE) {
        let _ = key.set_value("DisplayName", &"MyNotes");
        let _ = key.set_value("IconBackgroundColor", &"0");
    }

    // Set the process-level AUMID so Windows associates toast notifications
    // with this app even when the Start Menu shortcut lacks the property.
    #[link(name = "shell32")]
    extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(appid: *const u16) -> i32;
    }
    let wide: Vec<u16> = AUMID.encode_utf16().chain(std::iter::once(0)).collect();
    let _ = unsafe { SetCurrentProcessExplicitAppUserModelID(wide.as_ptr()) };
}

#[cfg(not(target_os = "windows"))]
fn register_aumid() {}

/// Argument the autostart plugin registers in the Windows Run key. When the
/// process is launched with this flag, it was started by Windows at logon and
/// should run hidden in the tray instead of popping a window.
const AUTOSTART_FLAG: &str = "--autostart";

/// True when this process was launched by Windows at logon (autostart).
fn launched_by_autostart() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_FLAG)
}

/// Show, unminimize, and focus the main window. Used by the tray menu,
/// tray icon clicks, and the single-instance callback (which fires when
/// Windows activates the app from a notification click or a second launch).
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        // Start with Windows using the official plugin (registry Run key,
        // no scripts). The --autostart flag distinguishes boot launches.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ))
        // Exactly one instance may poll the backend for notifications;
        // otherwise duplicate Windows toasts would be possible. When the app
        // is already running and the user double-clicks the exe or Windows
        // activates the app from a notification click, this callback runs in
        // the first instance and brings its window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .setup(|app| {
            // Register the AUMID so Windows recognises MyNotes for toast
            // notifications. This is a no-op on non-Windows platforms.
            register_aumid();

            // MyNotes is a background-first app: keep autostart enabled so
            // notifications arrive after every Windows restart.
            let autolaunch = app.autolaunch();
            if !autolaunch.is_enabled().unwrap_or(false) {
                let _ = autolaunch.enable();
            }

            // Windows login launch: start hidden in the tray. Manual launches
            // (double-click, notification click) show the window.
            if launched_by_autostart() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            } else {
                show_main_window(app.handle());
            }

            // System tray with Open/Quit. Left-click opens the app (Windows
            // convention); right-click shows the menu.
            let open = MenuItem::with_id(app, "open", "Open MyNotes", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit MyNotes", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let _tray = TrayIconBuilder::with_id("mynotes-tray")
                .icon(app.default_window_icon().expect("missing app icon").clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main_window(app),
                    // Quitting from the tray is the only way to fully exit;
                    // closing the window only hides it.
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Closing the window hides the app into the tray instead of
                // quitting, so the background notification poller keeps
                // running. Quit is available from the tray menu.
                #[cfg(target_os = "windows")]
                {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}