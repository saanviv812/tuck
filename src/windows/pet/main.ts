// Desk pet: the buddy lives on top of the taskbar. It wanders a little,
// watches the cursor, cheers when a thought is saved, and naps when ignored.
// Double-click opens capture; drag to carry it, release and it drops back down.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { Menu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { Buddy } from "../../buddies/buddy";
import { app, store, updateSettings } from "../../lib/store";

interface Area { x: number; y: number; w: number; h: number; scale: number }

const w = getCurrentWindow();
const SCALE = 4;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const buddy = new Buddy("pip", {
  scale: SCALE,
  sleepAfterMs: 60000,
  onDoubleClick: () => app.openCapture(),
  onDragStart: () => { dragging = true; w.startDragging(); },
});
document.getElementById("pet")!.append(buddy.el);

let area: Area | null = null;
let pos = { x: 0, y: 0 };
let dragging = false;
let walking: number | null = null;
let count = -1;
let stayPut = false;

// fixed window size (logical px) — innerWidth/innerHeight read 0 while hidden
const PET_W = 112;
const PET_H = 96;
const floorY = () => (area ? area.y + area.h - Math.round(PET_H * area.scale) : pos.y);
const clampX = (x: number) => (area ? Math.max(area.x, Math.min(area.x + area.w - Math.round(PET_W * area.scale), x)) : x);

async function place(x: number, y: number) {
  pos = { x: Math.round(x), y: Math.round(y) };
  await w.setPosition(new PhysicalPosition(pos.x, pos.y));
}

async function init() {
  area = await invoke<Area | null>("work_area");
  const s = await store.load();
  buddy.setBuddy(s.settings.buddy);
  count = s.thoughts.length;
  const p = await w.outerPosition(); // Rust already placed it on the taskbar
  pos = { x: p.x, y: p.y };
  if (area) await place(clampX(pos.x), floorY());
}

// wander: short walks, long pauses
function scheduleWander() {
  setTimeout(async () => {
    if (!reduced && area && !dragging && !stayPut && buddy.isIdle) {
      const span = Math.round(180 * area.scale);
      const target = clampX(pos.x + (Math.random() < 0.5 ? -1 : 1) * Math.round(span * (0.4 + Math.random() * 0.6)));
      walkTo(target);
    }
    scheduleWander();
  }, 9000 + Math.random() * 14000);
}

function walkTo(target: number) {
  if (walking) clearInterval(walking);
  const step = Math.max(1, Math.round(SCALE * (area?.scale ?? 1))); // one sprite pixel (physical)
  walking = window.setInterval(async () => {
    const dx = target - pos.x;
    if (Math.abs(dx) <= step || dragging || !buddy.isIdle) {
      clearInterval(walking!); walking = null; buddy.setWalking(0);
      return;
    }
    buddy.setWalking(Math.sign(dx));
    await place(pos.x + Math.sign(dx) * step, pos.y);
  }, 70);
}

// after being carried, drop back to the taskbar
let settleTimer = 0;
w.onMoved(({ payload }) => {
  if (!dragging) return;
  pos = { x: payload.x, y: payload.y };
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(fall, 260);
});
async function fall() {
  dragging = false;
  const floor = floorY();
  let vy = 0;
  const x = clampX(pos.x);
  while (pos.y < floor) {
    vy += 3 * (area?.scale ?? 1);
    await place(x, Math.min(floor, pos.y + vy));
    await new Promise((r) => setTimeout(r, 16));
  }
  await place(x, floor);
  buddy.react("happy", 700);
}

// eyes follow the cursor anywhere on screen; getting close wakes it up
let away = false;
app.onCursor((x, y) => {
  if (away) return;
  buddy.lookAt(x, y);
  if (Math.hypot(x - PET_W / 2, y - PET_H / 2) < 120) buddy.nudge();
});

// back from the popup: a little hop hello
// while the popup is open the buddy is "up there", so it vanishes from here
listen("pet:back", () => { away = false; buddy.el.style.visibility = ""; buddy.pause(false); buddy.react("happy", 600); });
listen("pet:away", () => { away = true; buddy.el.style.visibility = "hidden"; buddy.pause(true); });

// cheer when a thought lands; follow buddy changes from settings
listen("store:changed", async () => {
  const s = await store.load();
  buddy.setBuddy(s.settings.buddy);
  if (count >= 0 && s.thoughts.length > count) buddy.react("happy", 1200);
  count = s.thoughts.length;
});

// right-click: change what the buddy is doing
addEventListener("contextmenu", async (e) => {
  e.preventDefault();
  const asleep = buddy.isNapping || buddy.isAsleep;
  const name = buddy.name.toLowerCase();
  const menu = await Menu.new({
    items: [
      asleep
        ? { id: "wake", text: `wake ${name} up`, action: () => buddy.wake() }
        : { id: "nap", text: "take a nap", action: () => buddy.nap() },
      { id: "dance", text: "do a little dance", action: () => { buddy.wake(); buddy.react("happy", 2600); } },
      { id: "hi", text: "say hi", action: () => { buddy.wake(); buddy.react("poke", 1600); } },
      { id: "stay", text: stayPut ? "wander around" : "stay put", action: () => { stayPut = !stayPut; if (walking) { clearInterval(walking); walking = null; buddy.setWalking(0); } } },
      await PredefinedMenuItem.new({ item: "Separator" }),
      { id: "catch", text: "tuck a thought", action: () => app.openCapture() },
      { id: "lib", text: "see all my thoughts", action: () => app.openLibrary() },
      await PredefinedMenuItem.new({ item: "Separator" }),
      { id: "hide", text: `hide ${name}`, action: () => updateSettings({ desk_pet: false }) },
    ],
  });
  await menu.popup();
});

init().then(scheduleWander);
