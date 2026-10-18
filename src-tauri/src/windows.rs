//! The three windows: the popup ("capture"), the library, and the desk pet.

use crate::tray;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

const CAPTURE_W: f64 = 480.0;
pub(crate) const PET_W: f64 = 112.0;
pub(crate) const PET_H: f64 = 96.0;

/// Open the popup on the monitor the cursor is on, a little above centre.
pub fn show_capture(app: &AppHandle) {
    let Some(w) = app.get_webview_window("capture") else {
        return;
    };
    if let Ok(c) = w.cursor_position() {
        if let Ok(Some(m)) = app.monitor_from_point(c.x, c.y) {
            let s = m.scale_factor();
            let wa = m.work_area();
            let x = wa.position.x as f64 + (wa.size.width as f64 - CAPTURE_W * s) / 2.0;
            let y = wa.position.y as f64 + wa.size.height as f64 * 0.24;
            let _ = w.set_position(PhysicalPosition::new(x as i32, y as i32));
        }
    }
    // one buddy at a time: while the popup is open, the desk pet is "up there"
    let _ = app.emit_to("pet", "pet:away", ());
    let _ = w.show();
    let _ = w.set_focus();
    let _ = app.emit_to("capture", "capture:shown", ());
}

pub fn hide_capture(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("capture") {
        let _ = w.hide();
    }
    let _ = app.emit_to("pet", "pet:back", ());
}

/// The global shortcut: open the popup, or close it if it's already in front.
pub fn toggle_capture(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("capture") {
        if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) {
            hide_capture(app);
            return;
        }
    }
    show_capture(app);
}

/// The library is created when first needed and destroyed when closed, so it
/// costs no memory while you're not using it.
pub fn show_library(app: &AppHandle, thought_id: Option<String>) {
    let w = match app.get_webview_window("library") {
        Some(w) => w,
        None => match WebviewWindowBuilder::new(
            app,
            "library",
            WebviewUrl::App("windows/library/index.html".into()),
        )
        .title("tuck")
        .inner_size(1000.0, 680.0)
        .min_inner_size(760.0, 520.0)
        .decorations(false)
        .center()
        .visible(false)
        .build()
        {
            Ok(w) => w,
            Err(e) => {
                crate::commands::log_to_file(app, &format!("library window: {e}"));
                return;
            }
        },
    };
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
    if let Some(id) = thought_id {
        let _ = app.emit_to("library", "library:focus", id);
    }
}

/// Turn the desk pet on or off.
pub fn set_pet(app: &AppHandle, on: bool) {
    tray::set_pet_label(app, on);
    let existing = app.get_webview_window("pet");
    match (on, existing) {
        (false, Some(w)) => {
            let _ = w.close();
        }
        (true, None) => {
            // start already standing on the taskbar, right-hand side
            let (mut x, mut y) = (200.0, 200.0);
            if let Ok(Some(m)) = app.primary_monitor() {
                let s = m.scale_factor();
                let wa = m.work_area();
                x = (wa.position.x as f64 + wa.size.width as f64) / s - PET_W - 180.0;
                y = (wa.position.y as f64 + wa.size.height as f64) / s - PET_H;
            }
            let b = WebviewWindowBuilder::new(
                app,
                "pet",
                WebviewUrl::App("windows/pet/index.html".into()),
            )
            .position(x, y)
            .title("buddy")
            .inner_size(PET_W, PET_H)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            // created visible but unfocused: Tauri shows it without activating it
            // and applies the frameless style itself (a raw ShowWindow didn't)
            .focused(false)
            .focusable(false) // never the window Windows hands focus to
            .visible(true);
            if let Err(e) = b.build() {
                crate::commands::log_to_file(app, &format!("pet window: {e}"));
            }
        }
        _ => {}
    }
}
