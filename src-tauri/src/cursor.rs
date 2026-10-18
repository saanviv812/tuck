//! Tells the windows where the mouse is, so the buddy's eyes can follow it
//! anywhere on screen. Only sends anything when the mouse actually moves, so an
//! idle desktop costs (almost) nothing.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

#[derive(Serialize, Clone)]
struct Point {
    x: f64,
    y: f64,
}

/// Physical cursor position. On Windows this reads it straight from the OS,
/// without a round trip through the UI thread.
fn now(app: &AppHandle) -> Option<PhysicalPosition<f64>> {
    #[cfg(windows)]
    {
        let _ = app;
        let mut p = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
        if unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut p) } != 0 {
            return Some(PhysicalPosition::new(p.x as f64, p.y as f64));
        }
        None
    }
    #[cfg(not(windows))]
    {
        app.cursor_position().ok()
    }
}

/// Coordinates are sent in each window's CSS pixels and may lie outside it.
pub fn track(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = (f64::NAN, f64::NAN);
        loop {
            std::thread::sleep(std::time::Duration::from_millis(40));
            let Some(c) = now(&app) else { continue };
            if (c.x - last.0).abs() < 2.0 && (c.y - last.1).abs() < 2.0 {
                continue;
            }
            last = (c.x, c.y);
            for label in ["capture", "pet", "library"] {
                let Some(w) = app.get_webview_window(label) else {
                    continue;
                };
                if !w.is_visible().unwrap_or(false) {
                    continue;
                }
                let (Ok(p), Ok(s)) = (w.inner_position(), w.scale_factor()) else {
                    continue;
                };
                let _ = app.emit_to(
                    label,
                    "cursor",
                    Point {
                        x: (c.x - p.x as f64) / s,
                        y: (c.y - p.y as f64) / s,
                    },
                );
            }
        }
    });
}
