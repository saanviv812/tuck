# tuck docs

Everything about how tuck is made: what it's for, how it looks, how it works,
how we check it, and how it gets to people.

| doc | read it if you want to know… |
| --- | --- |
| [product.md](product.md) | who it's for, the problem, what's in v1 and what isn't, how we'll know it works |
| [research.md](research.md) | what we looked at before designing, and what we took from it |
| [design.md](design.md) | the design system: colours, type, spacing, windows, buttons, the buddy sprites, motion, copy, accessibility |
| [flows.md](flows.md) | every screen, every button, every keyboard shortcut and every state, written down |
| [architecture.md](architecture.md) | the code: folders, data, how the windows talk to Rust, performance, reliability |
| [quality.md](quality.md) | how we test it, the numbers we measured, the manual checklist before a release |
| [shipping.md](shipping.md) | how a version goes from code to people's computers, and the launch plan |

Other files in the repo root:

- [README.md](../README.md): the friendly guide for people using tuck
- [CHANGELOG.md](../CHANGELOG.md): what changed in each version
- [CONTRIBUTING.md](../CONTRIBUTING.md): how to help
- [PRIVACY.md](../PRIVACY.md): what tuck does (and doesn't do) with your data
- [LICENSE](../LICENSE): MIT

## repo layout

```
tuck/
├── src/                      the app's screens (TypeScript, HTML, CSS)
│   ├── windows/
│   │   ├── capture/          the popup you see when you press the shortcut
│   │   ├── library/          the big window with all your thoughts + settings
│   │   └── pet/              the buddy that sits on your taskbar
│   ├── buddies/              the pixel buddies: drawings (cast.json), drawing code, behaviour
│   ├── lib/                  shared code: saving, suggestions, colours, types
│   ├── styles/tokens.css     the design system in code
│   ├── assets/fonts/         Departure Mono + its licence
│   └── dev/                  dev-only pages (the buddy contact sheet). never shipped
├── src-tauri/                the desktop side (Rust)
│   ├── src/
│   │   ├── lib.rs            starts the app, wires everything together
│   │   ├── store.rs          the data file: safe writes, backups, recovery
│   │   ├── commands.rs       everything the windows can ask for
│   │   ├── windows.rs        opening/closing/placing the three windows
│   │   ├── tray.rs           the tray icon and menu
│   │   ├── cursor.rs         tells windows where the mouse is (for the eyes)
│   │   └── updater.rs        signed background updates
│   ├── capabilities/         what each window is allowed to do
│   ├── icons/                app icons (generated, see scripts/)
│   └── tauri.conf.json       app name, windows, installer settings
├── site/                     the website (landing page): template, styles, script
├── tests/ui-audit.mjs        automated test of every popup + library flow
├── scripts/
│   ├── make-icon.py          draws the app icon from the buddy data
│   └── build-site.mjs        builds the website into one self-contained file
├── docs/                     you are here
└── .github/workflows/        automatic checks + release builds
```
