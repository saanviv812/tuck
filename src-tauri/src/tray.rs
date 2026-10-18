//! The tray icon (near the clock) and its menu.

use crate::store::Store;
use crate::{changed, updater, windows};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

/// Menu items whose labels change while the app runs.
pub(crate) struct PetItem(MenuItem<tauri::Wry>);
pub(crate) struct UpdateItem(pub(crate) MenuItem<tauri::Wry>);

fn pet_label(on: bool) -> &'static str {
    if on {
        "Hide desk buddy"
    } else {
        "Show desk buddy"
    }
}

pub fn set_pet_label(app: &AppHandle, on: bool) {
    if let Some(item) = app.try_state::<PetItem>() {
        let _ = item.0.set_text(pet_label(on));
    }
}

fn toggle_pet(app: &AppHandle) {
    let db = app.state::<Mutex<Store>>();
    let Ok(mut s) = db.lock() else { return };
    s.state.settings.desk_pet = !s.state.settings.desk_pet;
    let on = s.state.settings.desk_pet;
    let _ = s.save();
    drop(s);
    windows::set_pet(app, on);
    changed(app);
}

pub fn build(app: &AppHandle, shortcut: &str, pet_on: bool) -> tauri::Result<()> {
    let catch = MenuItem::with_id(
        app,
        "catch",
        format!("Tuck a thought\t{shortcut}"),
        true,
        None::<&str>,
    )?;
    let library = MenuItem::with_id(app, "library", "Open my thoughts", true, None::<&str>)?;
    let pet = MenuItem::with_id(app, "pet", pet_label(pet_on), true, None::<&str>)?;
    let version = format!("tuck {}", app.package_info().version);
    let update = MenuItem::with_id(app, "update", version, false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit tuck", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&catch, &library, &pet, &sep1, &update, &sep2, &quit])?;
    app.manage(PetItem(pet));
    app.manage(UpdateItem(update));

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("tuck — click to tuck a thought")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "catch" => windows::show_capture(app),
            "library" => windows::show_library(app, None),
            "pet" => toggle_pet(app),
            "update" => updater::install(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            // left click opens the popup; right click shows the menu
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = e
            {
                windows::show_capture(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
