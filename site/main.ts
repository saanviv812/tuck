// tuck website: the real buddy code, running in the page.
import { Buddy } from "../src/buddies/buddy";
import { BUDDIES, byId, CH, CW, defaultFrame, paint } from "../src/buddies/sprite";
import { suggest, hashtags } from "../src/lib/classify";
import { applyTheme } from "../src/lib/theme";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let current = "pip";

// small logo buddy in the top bar (static frame, crisp at any scale)
// The logo buddy watches the pointer too. Its box is cropped to the buddy's
// real pixels (the canvas has headroom for hops and marks) so it sits neatly
// beside the wordmark; pupils are painted at full screen resolution.
const logo = { id: "pip", box: { x: 0, y: 0, w: CW, h: CH }, look: { x: 0.4, y: 0.4 }, want: { x: 0.4, y: 0.4 }, raf: 0 };
const logoCanvas = $<HTMLCanvasElement>("logo-buddy");
const logoScale = () => Math.max(1, Math.round(2 * (window.devicePixelRatio || 1)));

function measureLogo(id: string) {
  const src = document.createElement("canvas");
  src.width = CW; src.height = CH;
  const sctx = src.getContext("2d")!;
  paint(sctx, byId(id), { ...defaultFrame(), look: { x: 0, y: 0 } }, 1);
  const px = sctx.getImageData(0, 0, CW, CH).data;
  let x0 = CW, y0 = CH, x1 = 0, y1 = 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    if (px[(y * CW + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  logo.box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const k = logoScale(), dpr = window.devicePixelRatio || 1;
  logoCanvas.width = logo.box.w * k; logoCanvas.height = logo.box.h * k;
  logoCanvas.style.width = `${(logo.box.w * k) / dpr}px`;
  logoCanvas.style.height = `${(logo.box.h * k) / dpr}px`;
}

function paintLogo() {
  const k = logoScale();
  const full = document.createElement("canvas");
  full.width = CW * k; full.height = CH * k;
  paint(full.getContext("2d")!, byId(logo.id), { ...defaultFrame(), look: logo.look }, k);
  const ctx = logoCanvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, logoCanvas.width, logoCanvas.height);
  const { x, y, w, h } = logo.box;
  ctx.drawImage(full, x * k, y * k, w * k, h * k, 0, 0, w * k, h * k);
}

function drawLogo(id: string) {
  logo.id = id;
  measureLogo(id);
  paintLogo();
}

function logoLookAt(px: number, py: number) {
  const r = logoCanvas.getBoundingClientRect();
  const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height * 0.45);
  const d = Math.hypot(dx, dy) || 1;
  const reach = Math.min(1, d / 120);
  logo.want = { x: (dx / d) * reach, y: (dy / d) * reach };
  if (!logo.raf) logo.raf = requestAnimationFrame(easeLogo);
}

function easeLogo() {
  const gx = logo.want.x - logo.look.x, gy = logo.want.y - logo.look.y;
  if (Math.abs(gx) < 0.01 && Math.abs(gy) < 0.01) { logo.look = { ...logo.want }; paintLogo(); logo.raf = 0; return; }
  logo.look = { x: logo.look.x + gx * 0.28, y: logo.look.y + gy * 0.28 };
  paintLogo();
  logo.raf = requestAnimationFrame(easeLogo);
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
  logoLookAt(e.clientX, e.clientY);
  hero.lookAt(e.clientX, e.clientY);
  castBuddies.forEach((x) => x.lookAt(e.clientX, e.clientY));
}, { passive: true });

applyTheme(current);
drawLogo(current);
note.textContent = "click a buddy to try it on.";
