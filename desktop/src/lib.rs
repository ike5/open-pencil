mod fig_container;
mod fonts;
mod menu;
mod menu_events;
mod window;

use fig_container::build_fig_file;
use fonts::{list_system_fonts, load_system_font};
use menu::install_app_menu;
use menu_events::handle_menu_event;
use window::show_main_window;

#[tauri::command]
fn log_to_terminal(level: String, message: String) {
    eprintln!("[webview:{}] {}", level, message);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    eprintln!("[OpenPencil] starting");
    let _ = fix_path_env::fix();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            build_fig_file,
            list_system_fonts,
            load_system_font,
            log_to_terminal
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id().0.as_str());
        })
        .setup(|app| {
            eprintln!("[OpenPencil] setup: installing menu");
            install_app_menu(app)?;
            eprintln!("[OpenPencil] setup: complete");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            match &event {
                tauri::RunEvent::Ready => {
                    eprintln!("[OpenPencil] app ready");
                }
                tauri::RunEvent::WindowEvent { label, event, .. } => {
                    eprintln!("[OpenPencil] window '{}': {:?}", label, event);
                }
                tauri::RunEvent::WebviewEvent { label, event, .. } => {
                    eprintln!("[OpenPencil] webview '{}': {:?}", label, event);
                }
                tauri::RunEvent::ExitRequested { code, .. } => {
                    eprintln!("[OpenPencil] exit requested: {:?}", code);
                }
                tauri::RunEvent::Exit => {
                    eprintln!("[OpenPencil] exit");
                }
                _ => {}
            }

            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } = event
            {
                if !has_visible_windows {
                    show_main_window(app);
                }
            }
        });
}
