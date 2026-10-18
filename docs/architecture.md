# architecture

## the big picture

```
          ┌──────────────── tuck.exe (Rust, Tauri 2) ────────────────┐
          │  store.rs  ── the only thing that reads/writes the file  │
          │  commands  ── what windows can ask for                   │
          │  windows / tray / cursor / updater                       │
          └───────▲──────────────▲──────────────────▲───────────────┘
        invoke +  │              │                  │   events:
        events    │              │                  │   store:changed, cursor,
          ┌───────┴──────┐ ┌─────┴────────┐ ┌───────┴──────┐   capture:shown, pet:away…
          │ capture      │ │ library      │ │ pet          │
          │ (the popup)  │ │ (+ settings) │ │ (desk buddy) │
          └──────────────┘ └──────────────┘ └──────────────┘
             each window is a small web page running in WebView2
```

- **Rust owns the data.** Windows never touch the file. They call commands, and
  Rust broadcasts `store:changed` so every window refreshes.
- **The popup is created once and kept hidden**, so it opens in tens of
  milliseconds. The **library** is created when needed and destroyed when
  closed, so it costs no memory otherwise. The **pet** exists only if it's turned on.

## data

One file: `%APPDATA%\app.tuck.desktop\thoughts.json`

```jsonc
{
  "version": 1,
  "thoughts": [{
    "id": "1a14d5a8c16000394dc",       // time-sortable
    "text": "onboarding idea: show one feature at a time",
    "created_at": 1792299142166,       // ms since 1970
    "updated_at": 1792299142166,
    "vault_id": null,                  // null = main pocket (the data still says "vault")
    "category": "Idea",                // or null
    "tags": ["onboarding"],
    "suggestion": { "category": "Idea", "tags": ["onboarding"], "vault_id": null },
    "archived": false
  }],
  "vaults": [{ "id": "…", "name": "design ideas", "color": "sage", "created_at": 0 }],   // pockets, in the UI
  "settings": {
    "shortcut": "Ctrl+Shift+Space", "buddy": "pip",   // "pip" = nibbles (kept for old files)
    "launch_at_login": false, "desk_pet": true, "auto_suggest": true
  }
}
```

Next to it: `thoughts.json.bak` (previous version) and `app.log` (errors, capped
at 256 KB).

### how a save works

1. serialise to `thoughts.json.tmp`
2. flush it to disk
3. copy the current file to `.bak`
4. rename the temp file over the real one (atomic)
5. if Windows refuses (antivirus or indexer has it open), retry for ~0.7 s, then write in place
6. if any step fails, the in-memory state is rolled back so the UI matches the disk

On startup, an unreadable file is renamed `thoughts.corrupt-<time>.json` and the
backup is loaded.

## commands

All in [`src-tauri/src/commands.rs`](../src-tauri/src/commands.rs).

| command | does |
| --- | --- |
| `load_state` | returns everything |
| `add_thought` · `update_thought` · `delete_thought` | thoughts (only safe fields can be updated) |
| `add_vault` · `update_vault` · `delete_vault` | pockets (deleting moves thoughts to main pocket) |
| `save_settings` · `set_shortcut` | settings; the shortcut is checked with Windows first |
| `open_capture` · `hide_capture` · `open_library` | windows |
| `work_area` | screen size minus the taskbar (for the pet) |
| `data_dir` · `open_data_dir` · `export_markdown` | your data |
| `log_line` | writes to `app.log` |
| `restart_to_update` | installs a downloaded update |

**Rule:** any command that might create a window is `async`. Sync commands run
on the main thread, and creating a WebView2 window there deadlocks on Windows.
(We hit this; it froze the whole app.)

## the frontend

- **no framework.** Plain TypeScript, built with Vite. Each window's JS is
  around 5–20 KB.
- [`lib/store.ts`](../src/lib/store.ts): one data API for every window. In the
  real app it calls Rust; in a normal browser it uses `localStorage`, so the
  UI can be designed and tested without building the app.
- [`buddies/sprite.ts`](../src/buddies/sprite.ts): pure functions that turn
  buddy data + a "frame" (eyes, pose, look, mark) into pixels.
- [`buddies/buddy.ts`](../src/buddies/buddy.ts): behaviour. Timers decide
  blinks, breaths, walks, moods; easing moves the eyes.
- [`lib/classify.ts`](../src/lib/classify.ts): suggestions. Plain rules
  (phrasing → type, distinctive words → tags, word overlap → pocket). It's the
  one place to swap in an opt-in AI model later.
- [`lib/theme.ts`](../src/lib/theme.ts): derives the app colours from the buddy.

## performance

The budget, and what we measured on a normal Windows 11 laptop (125% scaling):

| | budget | measured |
| --- | --- | --- |
| installer size | < 5 MB | 1.9 MB |
| shortcut → popup ready to type | < 100 ms | 16–43 ms |
| Enter → on disk | < 100 ms | 37–61 ms |
| idle CPU (popup hidden, desk buddy on) | < 3% of a core | ~1–3% |
| memory | — | ~200 MB, mostly WebView2's shared helper processes |

What keeps it cheap:

- buddies redraw **only when something changes** (a breath, a blink, a step).
  An idle buddy wakes up 1–3 times a second, not 60
- while the eyes are moving they animate at 60 fps, then stop
- Rust reads the cursor straight from Windows every 40 ms and only messages the
  windows **when it actually moves**
- the hidden popup's buddy is paused
- the library window doesn't exist unless it's open

## security

- the app's pages only load from the app itself (strict content security policy)
- each window has a short list of allowed abilities ([`capabilities/default.json`](../src-tauri/capabilities/default.json))
- updates are signed; the app refuses unsigned or tampered ones
- no network access except the update check
- the updater's private key never goes in the repo (it lives in `~/.tauri/` and in a GitHub secret)

## decisions log

| decision | why |
| --- | --- |
| Tauri, not Electron | ~2 MB vs ~90 MB installer, far less memory, all the desktop features we need |
| JSON file, not SQLite | readable, easy to back up, plenty fast for tens of thousands of thoughts |
| no UI framework | tiny windows, instant startup, nothing to keep updating |
| per-user NSIS installer | no admin prompt; works on locked-down work laptops |
| MSI dropped | one installer is enough; WiX downloads were flaky in CI |
| pupils drawn separately at device resolution | smooth gaze in any direction without breaking the pixel look |
| settings are staged | people asked for an explicit "save changes" step |
| "main pocket" instead of "inbox" | "inbox" confused people about what was in it |
