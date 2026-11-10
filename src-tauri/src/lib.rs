use tauri::{Manager, Emitter, AppHandle};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use std::sync::Mutex;

struct AppState {
    current_shortcut: Mutex<Option<Shortcut>>,
}

#[tauri::command]
fn set_shortcut(app: AppHandle, accelerator: String) -> Result<serde_json::Value, String> {
    let shortcut = accelerator.parse::<Shortcut>()
        .map_err(|_| "Ungültige Tastenkombination.".to_string())?;

    let state = app.state::<AppState>();
    let mut current = state.current_shortcut.lock().unwrap();

    if let Some(old) = *current {
        let _ = app.global_shortcut().unregister(old);
    }

    if let Err(_) = app.global_shortcut().register(shortcut) {
        return Ok(serde_json::json!({
            "ok": false,
            "error": "Diese Tastenkombination ist bereits belegt."
        }));
    }

    *current = Some(shortcut);
    Ok(serde_json::json!({ "ok": true }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("hotkey_pressed", ());
                    }
                })
                .build(),
        )
        .manage(AppState {
            current_shortcut: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![set_shortcut])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let default_shortcut = "F8".parse::<Shortcut>().map_err(|e| e.to_string())?;
            app.global_shortcut().register(default_shortcut)?;

            {
                let state = app.state::<AppState>();
                *state.current_shortcut.lock().unwrap() = Some(default_shortcut);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}