//! Everything the windows can ask Rust to do.
//!
//! Note: any command that may create a window is `async`. Sync commands run on
//! the main thread, and building a webview window there deadlocks on Windows.

use crate::store::{new_id, now_ms, Settings, State as Data, Store, Thought, Vault};
use crate::{windows, with_store, Db};
use serde::Serialize;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_opener::OpenerExt;

// ---- thoughts --------------------------------------------------------------

#[tauri::command]
pub fn load_state(db: Db) -> Result<Data, String> {
    Ok(db.lock().map_err(|_| "store is busy")?.state.clone())
}

#[tauri::command]
pub fn add_thought(
    app: AppHandle,
    db: Db,
    text: String,
    vault_id: Option<String>,
) -> Result<Thought, String> {
    let text = text.trim_end().to_string();
    if text.trim().is_empty() {
        return Err("nothing to save".into());
    }
    with_store(&app, &db, |s| {
        let now = now_ms();
        let vault_id = vault_id.filter(|v| s.vaults.iter().any(|x| &x.id == v));
        let t = Thought {
            id: new_id(),
            text,
            created_at: now,
            updated_at: now,
            vault_id,
            category: None,
            tags: vec![],
            suggestion: None,
            archived: false,
        };
        s.thoughts.insert(0, t.clone());
        Ok(t)
    })
}

/// Only these fields can be changed from the UI.
const EDITABLE: [&str; 6] = [
    "text",
    "vault_id",
    "category",
    "tags",
    "suggestion",
    "archived",
];

#[tauri::command]
pub fn update_thought(app: AppHandle, db: Db, id: String, patch: Value) -> Result<Thought, String> {
    with_store(&app, &db, |s| {
        let t = s
            .thoughts
            .iter_mut()
            .find(|t| t.id == id)
            .ok_or("thought not found")?;
        let mut v = serde_json::to_value(&*t).map_err(|e| e.to_string())?;
        if let (Some(obj), Some(p)) = (v.as_object_mut(), patch.as_object()) {
            for key in EDITABLE {
                if let Some(val) = p.get(key) {
                    obj.insert(key.into(), val.clone());
                }
            }
        }
        let mut next: Thought = serde_json::from_value(v).map_err(|e| e.to_string())?;
        next.updated_at = now_ms();
        *t = next.clone();
        Ok(next)
    })
}

#[tauri::command]
pub fn delete_thought(app: AppHandle, db: Db, id: String) -> Result<(), String> {
    with_store(&app, &db, |s| {
        s.thoughts.retain(|t| t.id != id);
        Ok(())
    })
}

// ---- vaults ----------------------------------------------------------------

#[tauri::command]
pub fn add_vault(app: AppHandle, db: Db, name: String, color: String) -> Result<Vault, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("a pocket needs a name".into());
    }
    with_store(&app, &db, |s| {
        let v = Vault {
            id: new_id(),
            name,
            color,
            created_at: now_ms(),
        };
        s.vaults.push(v.clone());
        Ok(v)
    })
}

#[tauri::command]
pub fn update_vault(
    app: AppHandle,
    db: Db,
    id: String,
    name: String,
    color: String,
) -> Result<(), String> {
    with_store(&app, &db, |s| {
        let v = s
            .vaults
            .iter_mut()
            .find(|v| v.id == id)
            .ok_or("vault not found")?;
        if !name.trim().is_empty() {
            v.name = name.trim().into();
        }
        v.color = color;
        Ok(())
    })
}

#[tauri::command]
pub fn delete_vault(app: AppHandle, db: Db, id: String) -> Result<(), String> {
    with_store(&app, &db, |s| {
        s.vaults.retain(|v| v.id != id);
        for t in s.thoughts.iter_mut() {
            if t.vault_id.as_deref() == Some(id.as_str()) {
                t.vault_id = None; // thoughts are never deleted with their vault
            }
        }
        Ok(())
    })
}

// ---- settings --------------------------------------------------------------

#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    db: Db<'_>,
    settings: Settings,
) -> Result<Settings, String> {
    let prev = db
        .lock()
        .map_err(|_| "store is busy")?
        .state
        .settings
        .clone();
    if prev.launch_at_login != settings.launch_at_login {
        let al = app.autolaunch();
        let r = if settings.launch_at_login {
            al.enable()
        } else {
            al.disable()
        };
        r.map_err(|e| format!("couldn't change start-up setting: {e}"))?;
    }
    let out = with_store(&app, &db, |s| {
        s.settings = settings.clone();
        Ok(settings.clone())
    })?;
    if prev.desk_pet != out.desk_pet {
        windows::set_pet(&app, out.desk_pet);
    }
    Ok(out)
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, db: Db, accel: String) -> Result<(), String> {
    let next: Shortcut = accel
        .parse()
        .map_err(|_| format!("\"{accel}\" isn't a shortcut I can use"))?;
    let gs = app.global_shortcut();
    let prev = db
        .lock()
        .map_err(|_| "store is busy")?
        .state
        .settings
        .shortcut
        .clone();
    let _ = gs.unregister_all();
    if let Err(e) = gs.register(next) {
        if let Ok(p) = prev.parse::<Shortcut>() {
            let _ = gs.register(p);
        }
        return Err(format!("{accel} is taken by another app ({e})"));
    }
    with_store(&app, &db, |s| {
        s.settings.shortcut = accel.clone();
        Ok(())
    })
}

// ---- windows ---------------------------------------------------------------

#[tauri::command]
pub async fn hide_capture(app: AppHandle) {
    windows::hide_capture(&app);
}

#[tauri::command]
pub async fn open_capture(app: AppHandle) {
    windows::show_capture(&app);
}

#[tauri::command]
pub async fn open_library(app: AppHandle, thought_id: Option<String>) {
    windows::show_library(&app, thought_id);
}

#[derive(Serialize)]
pub struct Area {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    scale: f64,
}

/// Work area (desktop minus taskbar) of the monitor the window is on.
#[tauri::command]
pub fn work_area(window: WebviewWindow) -> Option<Area> {
    let m = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let wa = m.work_area();
    Some(Area {
        x: wa.position.x,
        y: wa.position.y,
        w: wa.size.width,
        h: wa.size.height,
        scale: m.scale_factor(),
    })
}

#[tauri::command]
pub fn restart_to_update(app: AppHandle) {
    crate::updater::install(&app);
}

// ---- your data -------------------------------------------------------------

#[tauri::command]
pub fn data_dir(db: Db) -> String {
    db.lock()
        .map(|s| s.path.display().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub fn open_data_dir(app: AppHandle, db: Db) -> Result<(), String> {
    let path = db.lock().map_err(|_| "store is busy")?.path.clone();
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}

/// Write everything (minus archived) to a readable markdown file in Documents.
#[tauri::command]
pub fn export_markdown(app: AppHandle, db: Db) -> Result<String, String> {
    let s = db.lock().map_err(|_| "store is busy")?.state.clone();
    let mut out = String::from("# my thoughts\n\n");
    let mut groups: Vec<(String, Option<String>)> = vec![("Main pocket".into(), None)];
    groups.extend(
        s.vaults
            .iter()
            .map(|v| (v.name.clone(), Some(v.id.clone()))),
    );
    for (name, id) in groups {
        let items: Vec<&Thought> = s
            .thoughts
            .iter()
            .filter(|t| t.vault_id == id && !t.archived)
            .collect();
        if items.is_empty() {
            continue;
        }
        out.push_str(&format!("## {name}\n\n"));
        for t in items {
            let tags = if t.tags.is_empty() {
                String::new()
            } else {
                format!(
                    "  \n  _{}_",
                    t.tags
                        .iter()
                        .map(|x| format!("#{x}"))
                        .collect::<Vec<_>>()
                        .join(" ")
                )
            };
            out.push_str(&format!(
                "- **{}** — {}{}\n",
                ymd(t.created_at),
                t.text.replace('\n', "  \n  "),
                tags
            ));
        }
        out.push('\n');
    }
    let dir = app.path().document_dir().map_err(|e| e.to_string())?;
    let file = dir.join(format!("tuck-{}.md", ymd(now_ms())));
    std::fs::write(&file, out).map_err(|e| e.to_string())?;
    let _ = app.opener().reveal_item_in_dir(&file);
    Ok(file.display().to_string())
}

/// yyyy-mm-dd (UTC) from epoch ms, without pulling in a date crate.
fn ymd(ms: u64) -> String {
    let z = (ms / 86_400_000) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}")
}

// ---- log -------------------------------------------------------------------

/// Append a line to app.log next to the data file (capped at ~256 KB).
#[tauri::command]
pub fn log_line(db: Db, level: String, msg: String) {
    let Ok(s) = db.lock() else { return };
    let path = s.path.with_file_name("app.log");
    drop(s);
    if std::fs::metadata(&path)
        .map(|m| m.len() > 256 * 1024)
        .unwrap_or(false)
    {
        let _ = std::fs::rename(&path, path.with_extension("old.log"));
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        use std::io::Write;
        let _ = writeln!(f, "{} [{}] {}", now_ms(), level, msg.replace('\n', " "));
    }
}

/// Log from Rust code that isn't a command.
pub(crate) fn log_to_file(app: &AppHandle, msg: &str) {
    if let Some(db) = app.try_state::<Mutex<Store>>() {
        log_line(db, "warn".into(), msg.into());
    }
}

#[cfg(test)]
mod tests {
    use super::ymd;

    #[test]
    fn dates_for_the_markdown_export() {
        assert_eq!(ymd(0), "1970-01-01");
        assert_eq!(ymd(951_782_400_000), "2000-02-29"); // leap day
        assert_eq!(ymd(1_704_067_199_000), "2023-12-31");
        assert_eq!(ymd(1_704_067_200_000), "2024-01-01");
    }
}
