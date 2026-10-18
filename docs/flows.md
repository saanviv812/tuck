# flows

Every screen, button, shortcut and state in tuck.

## 1. first run

1. the installer finishes and opens tuck
2. the **library** opens on an empty state: "hi! i'm tuck", plus how to use the shortcut
3. the buddy appears on the taskbar
4. the tray icon appears near the clock

Nothing to sign up for, no tour, no questions.

## 2. catching a thought (the main flow)

```
anywhere → Ctrl+Shift+Space → popup opens, text box focused, buddy perks up (!)
        → type → buddy glances at your text; pauses make it think (?)
        → Enter → saved to disk → "got it. tucked away." + happy hop
        → popup closes itself (~0.8 s) → focus goes back to your app
        → in the background: #tags applied, a suggestion attached
```

**other ways to open the popup:** left-click the tray icon · double-click the
desk buddy · "tuck a thought" in the tray or buddy menu · "+ new thought" in the
library · `tuck.exe --capture`

### popup controls

| control | action |
| --- | --- |
| text box | multiline; `Shift+Enter` = new line |
| **main pocket ▾** | opens the pocket picker (optional) |
| esc hint | reminder that `Esc` closes |
| **save ↵** | same as `Enter` |
| **☰** (title bar) | opens the library (`Ctrl+L`) |
| **×** (title bar) | closes; the draft stays |
| title bar (empty part) | drag to move the popup |
| buddy | click = heart; drag = pick it up; double-click = open library |

### pocket picker

- opens with a click, `↓`/`↑` on the button, or `Tab` then `Enter`
- `↑` `↓` move, `Enter` picks, `Esc` closes
- **+ new pocket** asks for a name, creates it and picks it
- shortcut: `Ctrl+1`…`9` picks a pocket, `Ctrl+0` = main pocket

### popup states

| state | what you see |
| --- | --- |
| empty | placeholder, buddy curious |
| typing | buddy looks at the text |
| paused 3.5 s | buddy thinks (`?`) |
| Enter on empty | nothing saves; buddy thinks |
| saved | bubble + hop, then it closes |
| save failed | red-tinted bubble "couldn't save. your words are still here."; text stays |
| dismissed | text kept as a draft, restored next time |

## 3. the library

### left side

| item | shows |
| --- | --- |
| **all thoughts** (default) | everything not archived |
| **main pocket** | not in any pocket |
| **pockets** | one list per pocket; "+ new pocket" adds one |
| **archived** | archived thoughts only |
| **types** | appears once tuck has guessed types; click to filter, click again to clear |
| **tags** | top 24 tags; click to filter |

Drag a thought onto a pocket (or **main pocket**) to move it.

### middle: the list

- newest first, grouped by day ("today", "yesterday", "mon 14 oct")
- each row: text preview (2 lines), pocket dot, time, pocket name (in all/archived), type, up to 3 tags, "✦ suggestion" if there's one
- **search** (`/` or `Ctrl+F`): matches words, `#tags` and types; matches are highlighted; `Esc` clears; `↓` or `Enter` jumps into the list
- when a pocket is open: **rename** (inline, `Enter` saves, `Esc` cancels), **colour** (cycles), **delete** (click twice; thoughts move to main pocket)

### right: the thought

| control | action |
| --- | --- |
| text | edit in place; saves 0.45 s after you stop typing, and on leaving the box |
| suggestion card | "use this" applies type + tags + pocket; "no thanks" hides it |
| tucked | when it was saved (and edited) |
| pocket | move it |
| type | idea, to-do, question, link, quote, note, or no type |
| tags | comma separated; `#` optional; saved on change |
| **archive** / **restore** | put aside / bring back |
| **delete** | click twice within 3 s |

### keyboard

`↑` `↓` select · `Enter` edit · `Esc` back to list · `Delete` archive ·
`/` search · `Ctrl+N` new thought

### window buttons

`_` minimise · `□` maximise/restore (or double-click the title bar) · `×` close
(tuck keeps running in the tray)

### empty states

| where | message |
| --- | --- |
| no thoughts at all | "no thoughts yet" + the shortcut |
| main pocket empty | "your main pocket is empty" |
| pocket empty | "this pocket is empty" |
| archive empty | "nothing archived" |
| search, no match | 'nothing matches "…"' + "try fewer words, or a #tag" |
| nothing selected | "pick a thought" |

## 4. settings

Opens from **settings** in the library. **Everything is a preview until you
press save changes.**

| section | controls |
| --- | --- |
| your buddy | 9 tiles; click to preview (the app recolours right away) |
| shortcut | click, press new keys (needs `Ctrl`, `Alt` or `Shift`, unless it's an F-key); `Esc` cancels recording |
| behaviour | desk buddy · start when I log in · suggestions |
| your data | the file path · **show file** · **export as markdown** (these act straight away) |
| footer | "not saved yet" note · **cancel** · **save changes** (disabled until something changes) |

**cancel**, **×** and `Esc` all undo the preview. If the new shortcut is taken
by another app, saving shows why and keeps your old one.

## 5. the desk buddy

- stands on the taskbar, bottom right; never steals focus
- wanders every 9–23 s (unless "stay put"); naps after 60 s without the mouse nearby
- eyes follow the cursor; moving close wakes it up
- hides while the popup is open, and hops back after
- cheers when a thought is saved from anywhere
- **double-click** = popup · **click** = heart · **drag** = carry it, it drops back down
- **right-click menu:** take a nap / wake up · do a little dance · say hi ·
  stay put / wander around · tuck a thought · see all my thoughts · hide

## 6. the tray

- **left-click** = popup
- **right-click menu:** Tuck a thought (shows the shortcut) · Open my thoughts ·
  Show/Hide desk buddy · version, or "Restart to update to x.y.z" · Quit tuck

## 7. updates

1. ~30 s after launch, then every 12 h, tuck checks GitHub for a new version
2. if there is one, it downloads it quietly and checks its signature
3. the tray item changes to "Restart to update to x.y.z"
4. the user clicks it whenever they like; the installer runs on its own and tuck reopens

Nothing installs without the user choosing it.

## 8. edge cases

| case | behaviour |
| --- | --- |
| launch tuck again while it's running | the library comes to the front (no second copy) |
| shortcut taken at startup | logged; the user can pick another in settings |
| data file broken | kept aside as `thoughts.corrupt-<time>.json`; the backup loads |
| antivirus holding the file | save retries for a moment, then writes in place |
| two windows editing | every change is broadcast; windows refresh |
| quick double changes in settings | saved in order; the last one wins |
| multiple monitors | popup opens on the monitor your cursor is on |
| high DPI / scaling | everything scales; sprites stay crisp |
| reduced motion | no walking, hopping or UI animation |
| first run after the rename from ThoughtCatcher | old data is copied to tuck's folder; the old folder is left untouched |
