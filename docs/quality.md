# quality

## automated UI test

[`tests/ui-audit.mjs`](../tests/ui-audit.mjs) drives the real popup and library
pages in a hidden, separate Edge window and checks 46 things: typing, Enter,
Shift+Enter, empty saves, drafts, every pocket picker path, search, filters,
selection, editing, tags, moving, suggestions, archive/restore, two-step
delete, pocket create/rename/delete, settings preview/cancel/save/Esc, theme
colours, and "only one buddy on screen".

```bash
npm run dev        # terminal 1
npm run test:ui    # terminal 2 → "46/46 passed"
```

It never touches your real mouse, keyboard or data.

## type and build checks

```bash
npm run build                                   # TypeScript + production bundle
cargo check --manifest-path src-tauri/Cargo.toml
```

Both run on every push to `main` ([`.github/workflows/check.yml`](../.github/workflows/check.yml)).

## visual review

`npm run dev`, then open `http://localhost:1420/dev/sheet.html`: every buddy in
every state side by side. Add `?s=8` to zoom, `?only=miso` for one buddy,
`?cast` for the README row.

## real-app checks we ran

On the installed-style release build, Windows 11, 125% scaling:

| check | result |
| --- | --- |
| shortcut → popup focused | 16–43 ms |
| Enter → written to disk, suggestion attached | 37–61 ms |
| focus goes back to the previous app after saving | yes |
| draft survives Esc and comes back | yes |
| library minimise / maximise / close | yes |
| popup ☰ with the library closed (the old freeze) | opens the library, no freeze |
| popup × | closes |
| second launch | brings the library forward; one process |
| desk buddy frameless, on the taskbar, never steals focus | yes |
| data moves over from the old ThoughtCatcher folder | yes, old folder untouched |
| idle CPU | ~1–3% of a core |

## before every release (manual)

Do these on a clean Windows user account if you can.

- [ ] install from the new `-setup.exe`; no admin prompt
- [ ] first run shows the "hi! i'm tuck" screen
- [ ] `Ctrl+Shift+Space` from a browser opens the popup on the right monitor
- [ ] type, Enter: bubble, hop, popup closes, focus returns
- [ ] `Esc` keeps the draft; it's back next time
- [ ] ☰ and × in the popup work
- [ ] library: search, pockets, drag to pocket, edit, archive, delete
- [ ] settings: preview a buddy, cancel (colour goes back), save (colour stays)
- [ ] change the shortcut; the new one works, the old one doesn't
- [ ] desk buddy: double-click, drag and drop, right-click menu items, hide, show from tray
- [ ] tray: left-click, every menu item, quit
- [ ] start when I log in: sign out and back in
- [ ] export as markdown opens a readable file
- [ ] update from the previous version: "restart to update" appears and works
- [ ] uninstall; reinstall; thoughts are still there
- [ ] Windows set to 100% and 150% scaling: no blurry buddies, nothing cut off
- [ ] "reduce animations" turned on in Windows: buddy stays still

## known limitations

- **SmartScreen warning** on download until the app is code-signed
- **Windows only** for now
- **memory** is around 200 MB because of WebView2's shared helper processes;
  most of that is shared with other WebView2 apps
- the app's own text is english only
- automated tests can't click the real popup (synthetic clicks don't reach that
  window), so popup buttons are on the manual checklist
