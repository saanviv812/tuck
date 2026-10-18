//! tuck — a tiny desktop app for catching thoughts.
//!
//! Modules:
//! - `store`    the JSON file on disk (atomic writes, backups)
//! - `commands` everything the windows can ask Rust to do
//! - `windows`  the popup, library and desk pet windows
//! - `tray`     the tray icon and its menu
//! - `cursor`   tells windows where the mouse is (for the buddy's eyes)
//! - `updater`  quiet, signed background updates

mod commands;
mod cursor;
mod store;
mod tray;
mod updater;
mod windows;

use std::sync::Mutex;
use store::{State as Data, Store};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub(crate) type Db<'a> = State<'a, Mutex<Store>>;

/// Let every window know the data changed so they can refresh.
pub(crate) fn changed(app: &AppHandle) {
    let _ = app.emit("store:changed", ());
}

/// Change the data and save it. If saving fails, memory is rolled back so
/// what you see always matches what's on disk.
pub(crate) fn with_store<T>(app: &AppHandle, db: &Db, f: impl FnOnce(&mut Data) -> Result<T, String>) -> Result<T, String> {
    let mut s = db.lock().map_err(|_| "store is busy".to_string())?;
    let snapshot = s.state.clone();
    let out = f(&mut s.state)?;
    if let Err(e) = s.save() {
        s.state = snapshot;
        return Err(e);
    }
    drop(s);
    changed(app);
    Ok(out)
}

pub fn run() {
    let app = tauri::Builder::default()
        // a second launch talks to the running app instead of starting another
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // `tuck.exe --capture` opens the popup (handy as a pinned shortcut)
            if args.iter().any(|a| a == "--capture") {
                windows::show_capture(app)
            } else {
                windows::show_library(app, None)
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::Pending::default())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        windows::toggle_capture(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            // versions before the rename stored data under the old app id
            let legacy = dir.parent().map(|p| p.join("app.thoughtcatcher.desktop"));
            let store = Store::open(&dir, legacy.as_deref());
            let settings = store.state.settings.clone();
            let first_run = store.first_run;
            app.manage(Mutex::new(store));

            let handle = app.handle().clone();
            if let Ok(sc) = settings.shortcut.parse::<Shortcut>() {
                if let Err(e) = handle.global_shortcut().register(sc) {
                    commands::log_to_file(&handle, &format!("shortcut {} unavailable: {e}", settings.shortcut));
                }
            }
            tray::build(&handle, &settings.shortcut, settings.desk_pet)?;
            cursor::track(handle.clone());
            updater::start(handle.clone());
            if settings.desk_pet {
                windows::set_pet(&handle, true);
            }
            let hidden = std::env::args().any(|a| a == "--hidden");
            if first_run || !hidden {
                windows::show_library(&handle, None);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_state,
            commands::add_thought,
            commands::update_thought,
            commands::delete_thought,
            commands::add_vault,
            commands::update_vault,
            commands::delete_vault,
            commands::save_settings,
            commands::set_shortcut,
            commands::hide_capture,
            commands::open_capture,
            commands::open_library,
            commands::work_area,
            commands::data_dir,
            commands::open_data_dir,
            commands::export_markdown,
            commands::log_line,
            commands::restart_to_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tuck");

    app.run(|_app, event| {
        // closing the library never quits; tuck lives in the tray
        if let RunEvent::ExitRequested { api, code: None, .. } = event {
            api.prevent_exit();
        }
    });
}
