# design

## the direction

Matte Win9x pop-ups in warm pastels, with a small pixel buddy sitting on top.
Restraint does most of the work: one outline colour, flat fills, few pixels,
lowercase words.

**Never:** gradients, blur, glow, glass, soft drop shadows, see-through
surfaces, rounded corners, emoji used as icons, sparkle decorations for no
reason.

## colour

Everything is a token in [`src/styles/tokens.css`](../src/styles/tokens.css).
Five of them change with your buddy (set in [`src/lib/theme.ts`](../src/lib/theme.ts)).

| token | default | used for | follows buddy? |
| --- | --- | --- | --- |
| `--accent` | buddy's main colour | title bars, primary buttons, checkboxes | yes |
| `--face` | `#FFFDF6` + 7% buddy | window surfaces | yes |
| `--desk` | `#F6EFE2` + 22% buddy | the library background | yes |
| `--select` | white + 42% buddy | selected rows, highlights | yes |
| `--lo` / `--lo-2` | warm beige, tinted | bevel shadows, dividers | yes |
| `--field` | `#FFFFFF` | text boxes | slightly |
| `--edge` | `#5B4A41` | **every** outline, in the UI and the sprites | no |
| `--ink` | `#463227` | text (11.6:1 contrast on face) | no |
| `--ink-2` | `#7A6355` | secondary text (5.6:1) | no |
| `--ink-3` | `#A8968A` | placeholders only | no |
| `--v-*` | 7 pastels | pocket colour dots | no |

Buddy colours: nibbles `#F7B57E`, scoopie `#A9DCC6`, brewbie `#A9CCE8`, biscuit
`#F6C3CE`, miso `#CDBFE6`, matcha `#BFDDB2`, boba `#ECCDA8`, tango `#FBB86C`,
wobbles `#FCE3A0`. All are light enough that `--ink` text on them stays readable.

## type

One family: **Departure Mono**, on its 11 px grid. No font smoothing, so it
stays crisp.

| size | use |
| --- | --- |
| 11 px | all UI labels, buttons, lists |
| 13.75 px | thought previews in the list |
| 16.5 px | writing (popup and editor) |

Words are lowercase in the UI ("save changes", "all thoughts"). Shortcut keys
keep their normal case (`Ctrl`, `Esc`).

## space and structure

- **4 px grid:** 4, 8, 12, 16, 24, 32
- **borders:** 2 px `--edge`
- **raised** (buttons, windows): white top-left inset, `--lo-2` bottom-right inset
- **sunken** (text boxes, lists): the reverse
- **lift:** windows get a solid 4 px offset shadow in `--edge`. no blur, ever
- **pressed buttons** swap raised for sunken and shift 1 px

## components

| component | look | notes |
| --- | --- | --- |
| window | `--face`, 2 px edge, raised bevel, 4 px hard shadow | the popup, library and dialogs |
| title bar | `--accent`, 26 px, lowercase title | drag from empty space only, never from buttons |
| title button | 18 px square, small bevel, pixel-drawn icon | ☰ library, × close, _ minimise, □ maximise |
| button | `--face`, raised; primary uses `--accent` | min height 26 px |
| text field | white, sunken bevel | no focus ring (the caret is enough) |
| list row | dashed divider; selected = `--select` | sticky day headers |
| chip dot | 8 px square with a 1 px outline | pocket colour |
| suggestion card | dashed 2 px border | "use this" / "no thanks" |
| speech bubble | white, 2 px edge, 2 px hard shadow, stepped pixel tail | "got it. tucked away." |
| dialog | window + backdrop at 18% ink | settings; changes preview until saved |
| checkbox | 14 px square, fills with `--accent` | |
| toast | small bubble at the bottom | "saved", "archived", "moved to…" |

## the buddies

Drawn as data in [`src/buddies/cast.json`](../src/buddies/cast.json).

**Rules every buddy follows:**

- body is **16 px wide**, up to 16 px tall, standing on the same baseline
- drawn as the left 8 columns, then mirrored, so they're symmetrical
- one outline colour (`#5B4A41`), flat pastel fills, no shading
- **eyes:** a 2×2 white with a 1 px pupil. the pupil isn't part of the drawing;
  it's placed on top, in any direction, at sub-pixel precision, and eases
  toward the cursor
- happy = `^`, blink and sleep = a short line
- marks (`?`, `!`, `z`, heart, sparkle ticks) sit beside the head, never on the body
- feet always rest exactly on an edge: the popup's title bar, the library's
  status bar, or the taskbar

**Rendering:** a 26×23 logical canvas drawn at your screen's real resolution
(always a whole number of screen pixels per sprite pixel, so edges stay crisp at
125%, 150% and so on).

**The cast** (the `id` in brackets is what's saved in settings; it never changes):

| name | what | why it's in |
| --- | --- | --- |
| nibbles (`pip`) | mouse (default) | the original idea; round ears, curly tail |
| scoopie (`scoop`) | mint ice cream | pointed cone, cute and instantly readable |
| brewbie (`latte`) | coffee cup | handle + steam; everyone's work buddy |
| biscuit (`pup`) | puppy | floppy ears, cream snout, wagging tail. the only pink buddy |
| miso (`miso`) | cat | pointed ears, tail |
| matcha (`cupcake`) | matcha cupcake | green liner, frosting, sprinkles, cherry |
| boba (`boba`) | milk tea | tall cup, straw, pearls |
| tango (`clem`) | orange | round, with a leaf |
| wobbles (`purin`) | caramel pudding | on a little plate |

We cut the frog, chick, penguin, bunny, bear, doughnut, toast, onigiri, macaron,
strawberry and shortcake during review. They either didn't read clearly at 16 px, looked
scary with the eye style, or clashed with the palette.

## motion

| state | when | what happens |
| --- | --- | --- |
| idle | default | breathes once a second, blinks every 2–6 s (sometimes twice), tail flicks now and then |
| look | always | pupils glide toward the cursor, anywhere on screen |
| curious | popup opens, waking up | taller eyes, `!` |
| thinking | a pause while typing | glances up, `?` |
| saving / happy | after Enter | `^ ^`, hop, squash, sparkle ticks |
| poke | click | `^ ^`, heart |
| held / fall | drag | dangles, drops with gravity, lands happy |
| sleepy | 40–60 s with no input | lies down flatter, `z` |
| walk | idle wander | 2-step waddle, 1 sprite pixel per step, faces where it's going |

UI motion is 80–160 ms with `steps()` timing, so even the UI moves in pixel
beats. **`prefers-reduced-motion`** turns off walking, hopping and all UI
animation; the buddy just sits and blinks.

## words

Lowercase, short, warm, never cutesy. One way to say each thing, used
everywhere.

| moment | copy |
| --- | --- |
| popup placeholder | "What's on your mind?" (sometimes "Quick, catch that thought.") |
| saved | "got it. tucked away." |
| save failed | "couldn't save. your words are still here." |
| first run | "hi! i'm tuck" + how to use the shortcut |
| nothing in a pocket | "this pocket is empty" + drag thoughts here |
| main pocket empty | "your main pocket is empty" |
| suggestion | "{buddy} thinks this might be…" · "use this" · "no thanks" |

## accessibility

- text contrast: 11.6:1 (main), 5.6:1 (secondary)
- everything works from the keyboard (see [flows.md](flows.md))
- buttons have labels and tooltips; the buddy canvas has an `aria-label`
- save feedback is announced (`role="status"`)
- works at any Windows scaling, and with reduced motion
- the popup opens on whichever monitor your cursor is on

## the website

The landing page in [`site/`](../site) uses the same tokens, font, window
style and the real buddy code, so it looks and behaves exactly like the app.
