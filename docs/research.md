# research

What we looked at before and while designing tuck, and what each one taught us.
Links were checked at the time of writing.

## references

| reference | what we took | what we didn't |
| --- | --- | --- |
| [Mochi](https://likhith1542.github.io/mochi/) (desk pet, Tauri + Matter.js) | the low-res "loaf" buddy style, a soft brown outline instead of black, flat pastel fills, white eyes with a moving pupil, a pet that sits on window edges and the taskbar | its characters and names. our cast is drawn from scratch |
| [Shimeji](https://sourceforge.net/projects/shimeji-desktop/) desk pets | the behaviour vocabulary: walk, sit, sleep, drag, fall and land | climbing and multiplying. too distracting for a work tool |
| [98.css](https://thenextweb.com/news/windows-98-css-library-html) / Windows 9x dialogs | hard 2px bevels (light top-left, dark bottom-right), square title bars, chunky buttons that look pressed when clicked | grey everything and blue gradients. we use warm pastels and no gradients |
| [Poolsuite](https://www.pcworld.com/article/3213692/pump-up-the-summer-jams-with-the-perfect-poolside-radio-station.html) | proof that a retro OS look can feel warm and modern, not ironic | its loudness. tuck stays quiet |
| [Susan Kare](https://www.thehenryford.org/collections/explore/articles/detail/articles/2019/03/15/pixels-with-personality-susan-kare-s-digital-creativity)'s Mac icons | a tight grid, one line weight, a small palette, and personality from very few pixels | 1-bit black and white |
| [Departure Mono](https://departuremono.com) | a pixel typeface that's still readable at small sizes, open licence | — |
| [Pedro Medeiros](https://ui.lemm.ee/post/2976406)' pixel animation guides | short 2–4 frame loops, squash and stretch, personality from timing | long, busy animations |
| [kawaii food art](https://kiyomink.itch.io/sweets) | big eyes, blush, chibi proportions make food read as a character | — |
| tray utilities ([global hotkey patterns](https://www.mintlify.com/NativePHP/desktop/features/global-shortcuts), screenshot tools) | rebindable shortcuts, showing the shortcut in the tray menu, left-click the tray for the main action | — |

## technical research

| question | finding | decision |
| --- | --- | --- |
| Electron or Tauri? | Tauri apps ship around 3–10 MB vs 80–200 MB and use much less memory, because they use the browser engine already on Windows ([comparison](https://tech-insider.org/tauri-vs-electron-2026/)) | Tauri 2 |
| how to stop the "Windows protected your PC" warning | needs a code signing certificate; Azure Artifact Signing is the cheapest route ([Tauri docs](https://v2.tauri.app/distribute/sign/windows/), [Xojo](https://blog.xojo.com/?p=16459)) | not in v1, documented in shipping.md |
| safe auto-updates | Tauri's updater requires signed update files ([docs](https://v2.tauri.app/es/plugin/updater/)) | signed updates via GitHub releases |
| WebView2 memory | share one environment, don't disable the GPU ([Microsoft](https://learn.microsoft.com/microsoft-edge/webview2/concepts/performance)) | one environment; library window only exists while open |
| distribution beyond GitHub | winget installs NSIS installers silently with `/S` | winget listing after v1 |

## what we learned while building

These came from testing the real app, not from reading:

- **creating a window inside a synchronous command freezes the app on Windows.**
  Any command that may open a window is now async.
- **a transparent desk-pet window steals focus** unless it's created
  non-focusable. Showing it with raw Windows calls also brought back a frame.
- **idle animation at 60 fps cost 31% of a CPU core.** Event-driven ticks
  (only redraw when something changes) brought it to around 1–3%.
- **2×2 pupils that snap between corners don't feel alive.** Sub-pixel pupils
  that ease toward the cursor do.
- **"inbox" confused people.** "all thoughts" + "unsorted" didn't.
