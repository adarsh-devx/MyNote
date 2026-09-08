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
/// tray icon clicks, the toast click handler (see show_toast), and the
/// single-instance callback (which fires when a second launch happens).
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Show a Windows toast for pending tasks with click-to-focus wired up.
///
/// This produces the same toast the notification plugin produces on Windows
/// (notify-rust → tauri-winrt-notification): same AUMID, title, body on the
/// second text line, silent audio, short duration — but it attaches the
/// WinRT `Activated` handler, because the plugin's desktop implementation
/// exposes no click/activation API (its JS `onAction` listener only works on
/// mobile), and a toast created without it just dismisses on click.
///
/// Like the plugin's `notify` command, the toast is shown fire-and-forget on
/// the async runtime, so delivery timing and deduplication are unchanged.
#[tauri::command]
async fn show_toast(app: AppHandle, title: String, body: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use tauri_winrt_notification::{Duration, Toast};

        tauri::async_runtime::spawn(async move {
            let click_app = app.clone();
            let result = Toast::new(AUMID)
                .title(&title)
                // Same toast layout the notification plugin produces:
                // title, empty first text line, body on the second line.
                .text1("")
                .text2(&body)
                .sound(None)
                .duration(Duration::Short)
                .on_activated(move |_| {
                    let app = click_app.clone();
                    // The Activated event fires on a WinRT worker thread;
                    // run the window calls on the main event loop, exactly
                    // like the tray and single-instance paths.
                    let _ = click_app.run_on_main_thread(move || show_main_window(&app));
                    Ok(())
                })
                .show();
            if let Err(error) = result {
                eprintln!("[mynotes] failed to show toast: {error:?}");
            }
        });
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .builder()
            .title(&title)
            .body(&body)
            .show()
            .map_err(|error| error.to_string())
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
        // is already running and the user double-clicks the exe, this
        // callback runs in the first instance and brings its window forward.
        // (Toast clicks never start a second process; they are handled
        // in-process by show_toast's Activated handler.)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .invoke_handler(tauri::generate_handler![show_toast])
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