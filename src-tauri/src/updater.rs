//! Quiet, signed updates. Checks in the background, downloads, then offers
//! "restart to update" in the tray. Nothing installs unless the user picks it.

use crate::commands::log_to_file;
use crate::tray::UpdateItem;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

/// A downloaded update waiting for the user to say "restart".
#[derive(Default)]
pub struct Pending(Mutex<Option<(Update, Vec<u8>)>>);

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        sleep(30).await;
        loop {
            if let Err(e) = check(&app).await {
                log_to_file(&app, &format!("update check: {e}"));
            }
            sleep(12 * 60 * 60).await;
        }
    });
}

async fn sleep(secs: u64) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_secs(secs))
    })
    .await;
}

async fn check(app: &AppHandle) -> Result<(), String> {
    if app
        .state::<Pending>()
        .0
        .lock()
        .map(|p| p.is_some())
        .unwrap_or(false)
    {
        return Ok(());
    }
    let Some(update) = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    let label = format!("Restart to update to {}", update.version);
    *app.state::<Pending>().0.lock().map_err(|_| "busy")? = Some((update, bytes));
    if let Some(item) = app.try_state::<UpdateItem>() {
        let _ = item.0.set_text(label);
        let _ = item.0.set_enabled(true);
    }
    let _ = app.emit("update:ready", ());
    Ok(())
}

pub fn install(app: &AppHandle) {
    let taken = app
        .state::<Pending>()
        .0
        .lock()
        .ok()
        .and_then(|mut p| p.take());
    if let Some((update, bytes)) = taken {
        // Windows: runs the installer in passive mode, then relaunches the app
        if let Err(e) = update.install(bytes) {
            log_to_file(app, &format!("update install: {e}"));
        }
    }
}
