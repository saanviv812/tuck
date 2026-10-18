// tuck website: the real buddy code, running in the page.
import { Buddy } from "../src/buddies/buddy";
import { BUDDIES, byId, CH, CW, defaultFrame, paint } from "../src/buddies/sprite";
import { suggest, hashtags } from "../src/lib/classify";
import { applyTheme } from "../src/lib/theme";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let current = "pip";

// small logo buddy in the top bar (static frame, crisp at any scale)
function drawLogo(id: string) {
  // draw at 1x, find the buddy's real pixels (the canvas has headroom for hops
  // and marks), then scale just that box up crisply
  const src = document.createElement("canvas");
  src.width = CW; src.height = CH;
  const sctx = src.getContext("2d")!;
  paint(sctx, byId(id), { ...defaultFrame(), look: { x: 0.4, y: 0.4 } }, 1);
  const px = sctx.getImageData(0, 0, CW, CH).data;
  let x0 = CW, y0 = CH, x1 = 0, y1 = 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    if (px[(y * CW + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.round(2 * dpr));
  const c = $<HTMLCanvasElement>("logo-buddy");
  c.width = w * k; c.height = h * k;
  c.style.width = `${(w * k) / dpr}px`; c.style.height = `${(h * k) / dpr}px`;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, x0, y0, w, h, 0, 0, w * k, h * k);
}

// ---- the live popup --------------------------------------------------------
const perch = $("demo-perch");
const win = $("demo-win");
const text = $<HTMLTextAreaElement>("demo-text");
const bubble = $("demo-bubble");
const list = $("demo-list");
const hero = new Buddy("pip", { scale: 4, perch: 0, x: 18, sleepAfterMs: 45000 });
perch.prepend(hero.el);
perch.style.height = hero.el.style.height;
const fitPerch = () => hero.setPerch(win.clientWidth);
new ResizeObserver(fitPerch).observe(win);

let bubbleTimer = 0;
function say(msg: string) {
  bubble.textContent = msg;
  bubble.hidden = false;
  const bx = parseFloat(hero.el.style.transform.match(/translate\(([-\d.]+)px/)?.[1] ?? "0");
  bubble.style.left = `${Math.min(bx + hero.width - 6, win.clientWidth - bubble.offsetWidth - 4)}px`;
  clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => (bubble.hidden = true), 1400);
}

function save() {
  const value = text.value.trim();
  if (!value) { hero.react("think", 900); text.focus(); return; }
  const t = { id: "demo", text: value, created_at: Date.now(), updated_at: Date.now(), vault_id: null, category: null, tags: hashtags(value), suggestion: null, archived: false };
  const s = suggest(t, [], []);
  const meta = [s.category.toLowerCase(), ...[...new Set([...t.tags, ...s.tags])].slice(0, 2).map((g) => `#${g}`)].join(" · ");
  const li = document.createElement("li");
  li.className = "new";
  li.innerHTML = `<span class="t"></span><span class="m"></span>`;
  (li.children[0] as HTMLElement).textContent = value;
  (li.children[1] as HTMLElement).textContent = meta;
  list.prepend(li);
  while (list.children.length > 4) list.lastElementChild?.remove();
  text.value = "";
  hero.react("save", 900);
  win.classList.remove("saved"); void win.offsetWidth; win.classList.add("saved");
  say("got it. tucked away.");
}

let typingTimer = 0, thinkTimer = 0;
text.addEventListener("input", () => {
  hero.nudge();
  hero.gazeAt({ x: 0, y: 1 });
  clearTimeout(typingTimer); clearTimeout(thinkTimer);
  typingTimer = window.setTimeout(() => hero.gazeAt(null), 1300);
  thinkTimer = window.setTimeout(() => { if (text.value.trim()) hero.react("think", 1600); }, 3500);
});
text.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); }
  if (e.key === "Escape") { text.blur(); }
});
text.addEventListener("focus", () => hero.react("curious", 700));
$("demo-save").addEventListener("click", save);

// ---- the cast, standing on a taskbar ----------------------------------------
const cast = $("cast");
const note = $("cast-note");
const castBuddies = BUDDIES.map((b) => {
  const opt = document.createElement("button");
  opt.className = "cast-opt";
  opt.type = "button";
  opt.setAttribute("role", "radio");
  opt.setAttribute("aria-checked", String(b.id === current));
  opt.setAttribute("aria-label", `${b.name}, the ${b.kind}`);
  opt.dataset.id = b.id;
  const buddy = new Buddy(b.id, { scale: 4, sleepAfterMs: 1e9 });
  opt.append(buddy.el);
  opt.insertAdjacentHTML("beforeend", `<span class="nm">${b.name.toLowerCase()}</span>`);
  opt.addEventListener("click", () => choose(b.id, buddy));
  cast.append(opt);
  return buddy;
});

function choose(id: string, buddy?: Buddy) {
  current = id;
  const b = byId(id);
  applyTheme(id);
  hero.setBuddy(id);
  drawLogo(id);
  buddy?.react("happy", 900);
  hero.react("happy", 700);
  cast.querySelectorAll(".cast-opt").forEach((o) => o.setAttribute("aria-checked", String((o as HTMLElement).dataset.id === id)));
  note.textContent = `hi, i'm ${b.name.toLowerCase()} the ${b.kind}.`;
}

// every buddy on the page watches the cursor
addEventListener("pointermove", (e) => {
  hero.lookAt(e.clientX, e.clientY);
  castBuddies.forEach((x) => x.lookAt(e.clientX, e.clientY));
}, { passive: true });

applyTheme(current);
drawLogo(current);
note.textContent = "click a buddy to try it on.";
