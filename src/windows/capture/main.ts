// Quick capture: open → type → Enter → gone. Everything else is optional.
import { Buddy } from "../../buddies/buddy";
import { applyTheme } from "../../lib/theme";
import { hashtags, suggest } from "../../lib/classify";
import { app, isTauri, logError, makeTitlebarDraggable, store } from "../../lib/store";
import type { State, Vault } from "../../lib/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const text = $<HTMLTextAreaElement>("text");
const win = $("win");
const perch = $("perch");
const bubble = $("bubble");
const saveBtn = $<HTMLButtonElement>("save");
const vaultBtn = $<HTMLButtonElement>("vault-btn");
const vaultName = $("vault-name");
const vaultDot = $("vault-dot");
const picker = $("picker");
const pickerList = $("picker-list");
const newVaultForm = $<HTMLFormElement>("new-vault");
const newVaultName = $<HTMLInputElement>("new-vault-name");

const DRAFT_KEY = "tc.draft.v1";
const PROMPTS = ["What's on your mind?", "What's on your mind?", "What's on your mind?", "Quick, catch that thought."];

let state: State | null = null;
let vaultId: string | null = null;
let saving = false;

if (!isTauri) document.body.classList.add("preview");

// ---- buddy -------------------------------------------------------------------
const buddy = new Buddy("pip", {
  scale: 4,
  perch: 0,
  x: 18,
  sleepAfterMs: 40000,
  onDoubleClick: () => app.openLibrary(),
});
perch.prepend(buddy.el);
perch.style.height = buddy.el.style.height; // feet land exactly on the title bar
const fitPerch = () => buddy.setPerch(win.clientWidth);
new ResizeObserver(fitPerch).observe(win);

// eyes follow the cursor — across the whole desktop in the app
let onScreen = !isTauri;
app.onCursor((x, y) => { if (onScreen) buddy.lookAt(x, y); });

// ---- draft -------------------------------------------------------------------
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (d && typeof d.text === "string") {
      text.value = d.text;
      vaultId = d.vault ?? null;
    }
  } catch { /* ignore a corrupt draft */ }
}
function saveDraft() {
  try {
    if (text.value.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: text.value, vault: vaultId }));
    else localStorage.removeItem(DRAFT_KEY);
  } catch { /* storage full or blocked: the text is still in the field */ }
}

// ---- vaults ------------------------------------------------------------------
const vaults = (): Vault[] => state?.vaults ?? [];
function renderVault() {
  const v = vaults().find((x) => x.id === vaultId);
  if (!v) vaultId = null;
  vaultName.textContent = v ? v.name : "main pocket";
  vaultDot.style.background = v ? `var(--v-${v.color})` : "var(--face)";
}

let pickIndex = 0;
function openPicker() {
  const items = [{ id: null as string | null, name: "main pocket", color: "" }, ...vaults()];
  pickerList.innerHTML = "";
  items.forEach((v, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.dataset.id = v.id ?? "";
    li.innerHTML = `<span class="chip-dot" style="background:${v.color ? `var(--v-${v.color})` : "var(--face)"}"></span><span></span>${i > 0 && i < 10 ? `<span class="n">ctrl ${i}</span>` : ""}`;
    (li.children[1] as HTMLElement).textContent = v.name;
    li.addEventListener("click", () => choose(v.id));
    pickerList.append(li);
  });
  const add = document.createElement("li");
  add.className = "add";
  add.setAttribute("role", "option");
  add.textContent = "+ new pocket";
  add.addEventListener("click", startNewVault);
  pickerList.append(add);
  pickIndex = Math.max(0, items.findIndex((v) => v.id === vaultId));
  highlight();
  picker.hidden = false;
  newVaultForm.hidden = true;
  vaultBtn.setAttribute("aria-expanded", "true");
  pickerList.focus();
}
function highlight() {
  [...pickerList.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === pickIndex)));
  (pickerList.children[pickIndex] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
}
function closePicker(refocus = true) {
  picker.hidden = true;
  vaultBtn.setAttribute("aria-expanded", "false");
  if (refocus) text.focus();
}
function choose(id: string | null) {
  vaultId = id;
  renderVault();
  saveDraft();
  closePicker();
}
function startNewVault() {
  newVaultForm.hidden = false;
  newVaultName.value = "";
  newVaultName.focus();
}
newVaultForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newVaultName.value.trim();
  if (!name) return;
  const colors = ["sage", "sky", "lilac", "blush", "butter", "cocoa", "orange"];
  const v = await store.addVault(name, colors[vaults().length % colors.length]);
  state = await store.load();
  choose(v.id);
});
newVaultName.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); newVaultForm.hidden = true; pickerList.focus(); }
});
pickerList.tabIndex = -1;
pickerList.addEventListener("keydown", (e) => {
  const n = pickerList.children.length;
  if (e.key === "ArrowDown") { pickIndex = (pickIndex + 1) % n; highlight(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { pickIndex = (pickIndex - 1 + n) % n; highlight(); e.preventDefault(); }
  else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    (pickerList.children[pickIndex] as HTMLElement).click();
  } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePicker(); }
});
vaultBtn.addEventListener("click", () => (picker.hidden ? openPicker() : closePicker()));
vaultBtn.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openPicker(); }
});

// ---- feedback ----------------------------------------------------------------
let bubbleTimer = 0;
function say(msg: string, ms = 1400, err = false) {
  bubble.textContent = msg;
  bubble.classList.toggle("err", err);
  bubble.hidden = false;
  const bx = parseFloat(buddy.el.style.transform.match(/translate\(([-\d.]+)px/)?.[1] ?? "0");
  bubble.style.left = `${Math.min(bx + buddy.width - 6, win.clientWidth - bubble.offsetWidth - 4)}px`;
  clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => (bubble.hidden = true), ms);
}

// ---- save --------------------------------------------------------------------
async function save() {
  const value = text.value.trim();
  if (saving) return;
  if (!value) {
    buddy.react("think", 900);
    text.focus();
    return;
  }
  saving = true;
  saveBtn.disabled = true;
  try {
    // 1. persist first — nothing else may delay or block this
    const t = await store.addThought(value, vaultId);
    text.value = "";
    localStorage.removeItem(DRAFT_KEY);
    buddy.react("save", 900);
    win.classList.remove("saved"); void win.offsetWidth; win.classList.add("saved");
    say("got it. tucked away.", 900);
    // 2. then organise, best-effort, off the critical path
    setTimeout(async () => {
      try {
        if (!state) return;
        const tags = hashtags(value);
        const fresh = await store.load();
        const s = fresh.settings.auto_suggest ? suggest({ ...t, tags }, fresh.vaults, fresh.thoughts) : null;
        await store.updateThought(t.id, { tags, suggestion: s });
      } catch (err) { logError("suggest", err); }
    }, 0);
    // 3. get out of the way
    setTimeout(hide, 820);
  } catch (err) {
    logError("save", err);
    buddy.react("curious", 1500);
    say("couldn't save. your words are still here.", 3200, true);
    saveDraft();
  } finally {
    saving = false;
    saveBtn.disabled = false;
  }
}

// ---- keyboard ----------------------------------------------------------------
let typingTimer = 0;
let thinkTimer = 0;
text.addEventListener("input", () => {
  saveDraft();
  buddy.nudge();
  buddy.gazeAt({ x: 0, y: 1 }); // eyes down at what you're writing
  clearTimeout(typingTimer);
  clearTimeout(thinkTimer);
  typingTimer = window.setTimeout(() => buddy.gazeAt(null), 1300);
  thinkTimer = window.setTimeout(() => { if (text.value.trim()) buddy.react("think", 1600); }, 3500);
});

text.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); }
});

addEventListener("keydown", (e) => {
  if (e.key === "Escape" && picker.hidden) { e.preventDefault(); dismiss(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") { e.preventDefault(); app.openLibrary(); }
  else if ((e.ctrlKey || e.metaKey) && /^[0-9]$/.test(e.key)) {
    e.preventDefault();
    const i = Number(e.key);
    if (i === 0) choose(null);
    else if (vaults()[i - 1]) choose(vaults()[i - 1].id);
  }
});

saveBtn.addEventListener("click", save);
makeTitlebarDraggable(win.querySelector<HTMLElement>(".titlebar")!);
$("close").addEventListener("click", dismiss);
$("open-lib").addEventListener("click", () => app.openLibrary());

function dismiss() {
  saveDraft();
  closePicker(false);
  hide();
}

function hide() {
  onScreen = false;
  buddy.pause(true);
  if (isTauri) app.hideCapture();
}

// ---- lifecycle -----------------------------------------------------------------
let loadSeq = 0;
async function refresh() {
  const seq = ++loadSeq;
  const fresh = await store.load();
  if (seq !== loadSeq) return;
  state = fresh;
  buddy.setBuddy(state.settings.buddy);
  applyTheme(state.settings.buddy);
  renderVault();
}

function onShown() {
  onScreen = true;
  buddy.pause(false);
  loadDraft();
  renderVault();
  closePicker(false);
  bubble.hidden = true;
  text.placeholder = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
  text.focus();
  text.setSelectionRange(text.value.length, text.value.length);
  buddy.nudge();
  buddy.react("curious", 700);
}

(async () => {
  await refresh();
  await store.onChange(refresh);
  if (!isTauri) onShown(); // the app shows the popup on demand; start paused
  else buddy.pause(true);
  if (isTauri) {
    const { listen } = await import("@tauri-apps/api/event");
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await listen("capture:shown", onShown);
    const w = getCurrentWindow();
    // clicking elsewhere tucks the window away; the draft is kept
    await w.onFocusChanged(({ payload: focused }) => {
      if (!focused && !saving) setTimeout(async () => { if (!(await w.isFocused())) dismiss(); }, 140);
    });
  }
})();
