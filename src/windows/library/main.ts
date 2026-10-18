// Library: browse, search, organise and develop caught thoughts.
import { Buddy } from "../../buddies/buddy";
import { BUDDIES, byId } from "../../buddies/sprite";
import { CATEGORIES } from "../../lib/classify";
import { app, isTauri, logError, makeTitlebarDraggable, store, updateSettings } from "../../lib/store";
import { applyTheme } from "../../lib/theme";
import { VAULT_COLORS, type State, type Thought, type Vault } from "../../lib/types";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type VaultSel = "all" | "inbox" | string;
const view = {
  vault: "all" as VaultSel,
  archived: false,
  category: null as string | null,
  tag: null as string | null,
  q: "",
};
let data: State = { thoughts: [], vaults: [], settings: { shortcut: "Ctrl+Shift+Space", buddy: "pip", launch_at_login: false, desk_pet: true, auto_suggest: true } };
let selected: string | null = null;
let visible: Thought[] = [];

// ---- helpers -------------------------------------------------------------------
const vaultOf = (id: string | null) => data.vaults.find((v) => v.id === id) ?? null;
const dot = (v: Vault | null) => `<span class="chip-dot" style="background:${v ? `var(--v-${v.color})` : "var(--face)"}"></span>`;
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
function dayLabel(ms: number) {
  const today = startOfDay(Date.now());
  const d = startOfDay(ms);
  if (d === today) return "today";
  if (d === today - 86400000) return "yesterday";
  const dt = new Date(ms);
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: sameYear ? undefined : "numeric" }).toLowerCase();
}
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toLowerCase();

let toastTimer = 0;
function toast(msg: string) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = msg;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2200);
}

function matches(t: Thought) {
  if (t.archived !== view.archived) return false;
  if (view.vault === "inbox" && t.vault_id) return false;
  if (view.vault !== "all" && view.vault !== "inbox" && t.vault_id !== view.vault) return false;
  if (view.category && t.category !== view.category) return false;
  if (view.tag && !t.tags.includes(view.tag)) return false;
  if (view.q) {
    const q = view.q.toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const hay = (t.text + " " + t.tags.map((x) => "#" + x).join(" ") + " " + (t.category ?? "")).toLowerCase();
    if (!terms.every((w) => hay.includes(w))) return false;
  }
  return true;
}

function highlight(text: string) {
  const safe = esc(text);
  if (!view.q) return safe;
  const terms = view.q.split(/\s+/).filter((w) => w.length > 1 && !w.startsWith("#")).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return safe;
  return safe.replace(new RegExp(`(${terms.map(esc).join("|")})`, "gi"), "<mark>$1</mark>");
}

// ---- side ----------------------------------------------------------------------
function renderSide() {
  const active = data.thoughts.filter((t) => !t.archived);
  const count = (pred: (t: Thought) => boolean) => active.filter(pred).length;
  type Row = { id: VaultSel; name: string; n: number; v: Vault | null; drop: boolean; hint: string };
  const item = (r: Row) => `<li><button data-vault="${r.id}" ${r.drop ? `data-drop="${r.id}"` : ""} title="${esc(r.hint)}" aria-current="${view.vault === r.id && !view.archived}">${r.id === "all" ? `<span class="chip-dot" style="background:var(--lo)"></span>` : dot(r.v)}<span class="name">${esc(r.name)}</span><span class="n">${r.n || ""}</span></button></li>`;
  $("view-top").innerHTML = item({ id: "all", name: "all thoughts", n: active.length, v: null, drop: false, hint: "everything you've tucked away" });
  const list = $("vault-list");
  list.innerHTML = [
    item({ id: "inbox", name: "main pocket", n: count((t) => !t.vault_id), v: null, drop: true, hint: "where thoughts go when you don't pick a pocket" }),
    ...data.vaults.map((v) => item({ id: v.id, name: v.name, n: count((t) => t.vault_id === v.id), v, drop: true, hint: `thoughts in ${v.name}` })),
  ].join("") + (data.vaults.length ? "" : `<li class="muted" style="padding:2px 8px 4px">make more pockets for different things, like ideas or reading</li>`);

  const archivedN = data.thoughts.filter((t) => t.archived).length;
  $("view-list").innerHTML = `<li><button data-archived="1" title="thoughts you've put aside" aria-current="${view.archived}"><span class="name">archived</span><span class="n">${archivedN || ""}</span></button></li>`;

  const cats = new Map<string, number>();
  const tags = new Map<string, number>();
  for (const t of active) {
    if (t.category) cats.set(t.category, (cats.get(t.category) ?? 0) + 1);
    for (const g of t.tags) tags.set(g, (tags.get(g) ?? 0) + 1);
  }
  $("cat-label").hidden = cats.size === 0;
  $("cat-list").innerHTML = [...cats].sort((a, b) => b[1] - a[1]).map(([c, n]) =>
    `<li><button data-cat="${esc(c)}" aria-current="${view.category === c}"><span class="name">${esc(c.toLowerCase())}</span><span class="n">${n}</span></button></li>`).join("");
  $("tag-label").hidden = tags.size === 0;
  $("tag-list").innerHTML = [...tags].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([g]) =>
    `<button class="tag" data-tag="${esc(g)}" aria-pressed="${view.tag === g}">#${esc(g)}</button>`).join("");
}

const pickVault = (e: Event) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-vault]");
  if (!b) return;
  view.vault = b.dataset.vault!;
  view.archived = false;
  render();
};
$("vault-list").addEventListener("click", pickVault);
$("view-top").addEventListener("click", pickVault);
$("view-list").addEventListener("click", () => { view.archived = !view.archived; if (view.archived) view.vault = "all"; render(); });
$("cat-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-cat]");
  if (!b) return;
  view.category = view.category === b.dataset.cat ? null : b.dataset.cat!;
  render();
});
$("tag-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tag]");
  if (!b) return;
  view.tag = view.tag === b.dataset.tag ? null : b.dataset.tag!;
  render();
});

// drag a thought onto a vault to move it
for (const el of ["vault-list", "view-top"]) $(el).addEventListener("dragover", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-drop]");
  if (!b) return;
  e.preventDefault();
  document.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop"));
  b.classList.add("drop");
});
for (const el of ["vault-list", "view-top"]) $(el).addEventListener("dragleave", () => document.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop")));
for (const el of ["vault-list", "view-top"]) $(el).addEventListener("drop", async (e) => {
  e.preventDefault();
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-drop]");
  document.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop"));
  const id = e.dataTransfer?.getData("text/thought");
  if (!b || !id) return;
  const vault_id = b.dataset.drop === "inbox" ? null : b.dataset.drop!;
  await store.updateThought(id, { vault_id });
  toast(`moved to ${vault_id ? vaultOf(vault_id)?.name : "main pocket"}`);
});

$("add-vault").addEventListener("click", () => {
  $("vault-form").hidden = false;
  $("add-vault").hidden = true;
  $<HTMLInputElement>("vault-name").value = "";
  $("vault-name").focus();
});
$("vault-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>("vault-name").value.trim();
  if (!name) return;
  const v = await store.addVault(name, VAULT_COLORS[(data.vaults.length + 3) % VAULT_COLORS.length]);
  $("vault-form").hidden = true;
  $("add-vault").hidden = false;
  view.vault = v.id;
  await reload();
});
$("vault-name").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { $("vault-form").hidden = true; $("add-vault").hidden = false; }
});
$("vault-name").addEventListener("blur", () => setTimeout(() => { $("vault-form").hidden = true; $("add-vault").hidden = false; }, 120));

// ---- list ----------------------------------------------------------------------
function renderList() {
  visible = data.thoughts.filter(matches).sort((a, b) => b.created_at - a.created_at);
  const v = vaultOf(view.vault);
  const title = view.archived ? "archived" : view.vault === "all" ? "all thoughts" : view.vault === "inbox" ? "main pocket" : v?.name ?? "all thoughts";
  $("list-title").textContent = title;
  $("list-count").innerHTML = `${visible.length}${view.category ? ` · ${esc(view.category.toLowerCase())}` : ""}${view.tag ? ` · #${esc(view.tag)}` : ""}${
    v && !view.archived ? ` · <button class="btn ghost" id="rename-vault">rename</button><button class="btn ghost" id="recolor-vault">colour</button><button class="btn ghost" id="delete-vault">delete</button>` : ""}`;

  const ol = $("thoughts");
  if (!visible.length) {
    const nothingAtAll = data.thoughts.length === 0;
    ol.innerHTML = `<li class="empty">${
      view.q ? `<span class="big">nothing matches "${esc(view.q)}"</span><span>try fewer words, or a #tag</span>`
      : nothingAtAll ? `<span class="big">no thoughts yet</span><span>press <span class="kbd">${esc(data.settings.shortcut)}</span> anywhere</span>`
      : view.archived ? `<span class="big">nothing archived</span><span>thoughts you archive rest here. you can bring them back anytime</span>`
      : view.vault === "inbox" ? `<span class="big">your main pocket is empty</span><span>new thoughts land here when you don't pick a pocket</span>`
      : `<span class="big">this pocket is empty</span><span>drag thoughts here, or pick it when you tuck one</span>`}</li>`;
    return;
  }
  let html = "";
  let lastDay = -1;
  for (const t of visible) {
    const d = startOfDay(t.created_at);
    if (d !== lastDay) { html += `<li class="day" role="presentation">${dayLabel(t.created_at)}</li>`; lastDay = d; }
    const vv = vaultOf(t.vault_id);
    const s = t.suggestion;
    html += `<li class="item${t.archived ? " archived" : ""}" role="option" draggable="true" data-id="${t.id}" aria-selected="${t.id === selected}">
      <div class="text">${highlight(t.text)}</div>
      <div class="meta">${dot(vv)}<span>${timeLabel(t.created_at)}</span>${view.vault === "all" || view.archived ? `<span>${esc(vv?.name ?? "main pocket")}</span>` : ""}${t.category ? `<span>${esc(t.category.toLowerCase())}</span>` : ""}${t.tags.slice(0, 3).map((g) => `<span>#${esc(g)}</span>`).join("")}${s ? `<span class="sugg" title="${esc(byId(data.settings.buddy).name)} has a suggestion">✦ suggestion</span>` : ""}</div>
    </li>`;
  }
  ol.innerHTML = html;
}

const thoughtsEl = $("thoughts");
thoughtsEl.addEventListener("click", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>(".item");
  if (li) select(li.dataset.id!);
});
thoughtsEl.addEventListener("dragstart", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>(".item");
  if (li && e.dataTransfer) { e.dataTransfer.setData("text/thought", li.dataset.id!); e.dataTransfer.effectAllowed = "move"; }
});
thoughtsEl.addEventListener("keydown", (e) => {
  const i = visible.findIndex((t) => t.id === selected);
  if (e.key === "ArrowDown") { e.preventDefault(); select(visible[Math.min(visible.length - 1, i + 1)]?.id ?? null, true); }
  else if (e.key === "ArrowUp") { e.preventDefault(); select(visible[Math.max(0, i - 1)]?.id ?? null, true); }
  else if (e.key === "Enter" && selected) { e.preventDefault(); document.querySelector<HTMLTextAreaElement>(".editor")?.focus(); }
  else if (e.key === "Delete" && selected) { e.preventDefault(); toggleArchive(selected); }
});
$("list-count").addEventListener("click", async (e) => {
  const id = (e.target as HTMLElement).id;
  const v = vaultOf(view.vault);
  if (!v) return;
  if (id === "rename-vault") {
    const btn = e.target as HTMLElement;
    const input = document.createElement("input");
    input.className = "field"; input.value = v.name; input.maxLength = 40; input.style.padding = "2px 6px";
    btn.replaceWith(input); input.focus(); input.select();
    const done = async (save: boolean) => { if (save && input.value.trim()) await store.updateVault(v.id, input.value.trim(), v.color); render(); };
    input.addEventListener("keydown", (k) => { if (k.key === "Enter") done(true); if (k.key === "Escape") done(false); });
    input.addEventListener("blur", () => done(true));
  } else if (id === "recolor-vault") {
    const next = VAULT_COLORS[(VAULT_COLORS.indexOf(v.color as typeof VAULT_COLORS[number]) + 1) % VAULT_COLORS.length];
    await store.updateVault(v.id, v.name, next);
  } else if (id === "delete-vault") {
    const btn = e.target as HTMLButtonElement;
    if (btn.dataset.armed) {
      await store.deleteVault(v.id);
      view.vault = "all";
      toast(`deleted "${v.name}". its thoughts moved to your main pocket`);
    } else {
      btn.dataset.armed = "1"; btn.textContent = "delete for good?";
      setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = "delete"; } }, 3000);
    }
  }
});

function select(id: string | null, scroll = false) {
  if (id === selected) return;
  flushEdit();
  selected = id;
  thoughtsEl.querySelectorAll<HTMLElement>(".item").forEach((li) => li.setAttribute("aria-selected", String(li.dataset.id === id)));
  if (scroll) thoughtsEl.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  renderDetail();
}

// ---- detail --------------------------------------------------------------------
let editTimer = 0;
let pendingEdit: { id: string; text: string } | null = null;
async function flushEdit() {
  clearTimeout(editTimer);
  if (!pendingEdit) return;
  const { id, text } = pendingEdit;
  pendingEdit = null;
  if (text.trim()) {
    await store.updateThought(id, { text });
    const note = document.querySelector(".saved-note");
    if (note) note.textContent = "saved";
  }
}

let detailBuddy: Buddy | null = null;
function renderDetail() {
  const el = $("detail");
  detailBuddy?.destroy();
  detailBuddy = null;
  const t = data.thoughts.find((x) => x.id === selected);
  if (!t) {
    const none = data.thoughts.length === 0;
    el.innerHTML = `<div class="empty"><span class="big">${none ? "hi! i'm tuck" : "pick a thought"}</span><span>${
      none ? `press <span class="kbd">${esc(data.settings.shortcut)}</span> from any app, type, press enter.<br>it's saved on this computer before you blink.` : "click one on the left to read or edit it"}</span></div>`;
    if (none && !data.settings.desk_pet) {
      detailBuddy = new Buddy(data.settings.buddy, { scale: 4, sleepAfterMs: 30000, onDoubleClick: () => app.openCapture() });
      el.querySelector(".empty")!.prepend(detailBuddy.el);
    }
    return;
  }
  const s = t.suggestion;
  const sv = s?.vault_id ? vaultOf(s.vault_id) : null;
  const showSugg = s && (s.category !== t.category || s.tags.some((g) => !t.tags.includes(g)) || (sv && t.vault_id !== sv.id));
  el.innerHTML = `
    <label class="sr" for="editor">Thought</label>
    <textarea class="field editor" id="editor" spellcheck="true">${esc(t.text)}</textarea>
    <div class="saved-note" aria-live="polite"></div>
    ${showSugg ? `<div class="suggestion">
      <div class="label">${esc(byId(data.settings.buddy).name.toLowerCase())} thinks this might be…</div>
      <div class="row">${s!.category ? `<span>${esc(s!.category.toLowerCase())}</span>` : ""}${s!.tags.map((g) => `<span>#${esc(g)}</span>`).join(" ")}${sv ? `<span>→ ${dot(sv)} ${esc(sv.name)}</span>` : ""}</div>
      <div class="row"><button class="btn" id="accept">use this</button><button class="btn ghost" id="dismiss">no thanks</button></div>
    </div>` : ""}
    <div class="meta-grid">
      <span>tucked</span><div>${dayLabel(t.created_at)}, ${timeLabel(t.created_at)}${t.updated_at - t.created_at > 60000 ? ` · edited ${dayLabel(t.updated_at)}` : ""}</div>
      <label for="m-vault">pocket</label>
      <select id="m-vault"><option value="">main pocket</option>${data.vaults.map((v) => `<option value="${v.id}" ${t.vault_id === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select>
      <label for="m-cat">type</label>
      <select id="m-cat" title="what sort of thought this is, so you can filter by it"><option value="">no type</option>${[...new Set([...CATEGORIES, ...(t.category ? [t.category] : [])])].map((c) => `<option value="${esc(c)}" ${t.category === c ? "selected" : ""}>${esc(c.toLowerCase())}</option>`).join("")}</select>
      <label for="m-tags">tags</label>
      <input id="m-tags" value="${esc(t.tags.join(", "))}" placeholder="words to find it by, like: work, recipes" title="words to find it by later. put a comma between them" spellcheck="false" />
    </div>
    <div class="actions">
      <button class="btn" id="archive" title="${t.archived ? "bring it back" : "put it aside without deleting it"}">${t.archived ? "restore" : "archive"}</button>
      <button class="btn ghost danger" id="delete">delete</button>
    </div>`;

  const editor = $<HTMLTextAreaElement>("editor");
  editor.addEventListener("input", () => {
    pendingEdit = { id: t.id, text: editor.value };
    document.querySelector(".saved-note")!.textContent = "";
    clearTimeout(editTimer);
    editTimer = window.setTimeout(flushEdit, 450);
  });
  editor.addEventListener("blur", flushEdit);
  editor.addEventListener("keydown", (e) => { if (e.key === "Escape") { editor.blur(); thoughtsEl.focus(); } });
  $<HTMLSelectElement>("m-vault").addEventListener("change", (e) => store.updateThought(t.id, { vault_id: (e.target as HTMLSelectElement).value || null }));
  $<HTMLSelectElement>("m-cat").addEventListener("change", (e) => store.updateThought(t.id, { category: (e.target as HTMLSelectElement).value || null }));
  $<HTMLInputElement>("m-tags").addEventListener("change", (e) => {
    const tags = [...new Set((e.target as HTMLInputElement).value.split(/[,\s]+/).map((x) => x.replace(/^#/, "").trim().toLowerCase()).filter(Boolean))];
    store.updateThought(t.id, { tags });
  });
  $("archive").addEventListener("click", () => toggleArchive(t.id));
  const del = $<HTMLButtonElement>("delete");
  del.addEventListener("click", async () => {
    if (del.dataset.armed) {
      const i = visible.findIndex((x) => x.id === t.id);
      await store.deleteThought(t.id);
      selected = visible[i + 1]?.id ?? visible[i - 1]?.id ?? null;
      toast("deleted");
    } else {
      del.dataset.armed = "1"; del.textContent = "delete for good?";
      setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "delete"; } }, 3000);
    }
  });
  document.getElementById("accept")?.addEventListener("click", () => store.updateThought(t.id, {
    category: s!.category || t.category,
    tags: [...new Set([...t.tags, ...s!.tags])],
    vault_id: sv ? sv.id : t.vault_id,
    suggestion: null,
  }));
  document.getElementById("dismiss")?.addEventListener("click", () => store.updateThought(t.id, { suggestion: null }));
}

async function toggleArchive(id: string) {
  const t = data.thoughts.find((x) => x.id === id);
  if (!t) return;
  const i = visible.findIndex((x) => x.id === id);
  await store.updateThought(id, { archived: !t.archived });
  selected = visible[i + 1]?.id ?? visible[i - 1]?.id ?? null;
  toast(t.archived ? "restored" : "archived");
}

// ---- search & keys ---------------------------------------------------------------
const q = $<HTMLInputElement>("q");
q.addEventListener("input", () => { view.q = q.value.trim(); if (view.q) { view.vault = "all"; } render(); });
q.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { q.value = ""; view.q = ""; render(); thoughtsEl.focus(); }
  if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); thoughtsEl.focus(); if (!selected && visible[0]) select(visible[0].id); }
});
addEventListener("keydown", (e) => {
  const typing = (e.target as HTMLElement).matches("input, textarea, select");
  if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f")) { e.preventDefault(); q.focus(); q.select(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); app.openCapture(); }
});

$("catch").addEventListener("click", () => app.openCapture());

// ---- status bar buddy --------------------------------------------------------------
const perch = $("perch");
const statusBuddy = new Buddy(data.settings.buddy, { scale: 3, perch: 192, x: 12, sleepAfterMs: 50000, onDoubleClick: () => app.openCapture() });
perch.append(statusBuddy.el);
app.onCursor((x, y) => {
  statusBuddy.lookAt(x, y);
  detailBuddy?.lookAt(x, y);
  pickerBuddies.forEach((b) => b.lookAt(x, y));
});
addEventListener("pointermove", () => statusBuddy.nudge());

// ---- settings ------------------------------------------------------------------------
// Changes are a preview until "save changes"; cancel, x or Esc put everything back.
const dlg = $<HTMLDialogElement>("settings");
let pickerBuddies: Buddy[] = [];
let draft: State["settings"] = { ...data.settings };
const same = (a: State["settings"], b: State["settings"]) => JSON.stringify(a) === JSON.stringify(b);

function markDirty() {
  const dirty = !same(draft, data.settings);
  $<HTMLButtonElement>("settings-save").disabled = !dirty;
  $("settings-note").textContent = dirty ? "not saved yet" : "";
}

$("open-settings").addEventListener("click", openSettings);
$("settings-close").addEventListener("click", cancelSettings);
$("settings-cancel").addEventListener("click", cancelSettings);
dlg.addEventListener("cancel", (e) => { e.preventDefault(); if (!recording) cancelSettings(); }); // Esc
dlg.addEventListener("close", () => { pickerBuddies.forEach((b) => b.destroy()); pickerBuddies = []; stopRecording(); });

function cancelSettings() {
  draft = { ...data.settings };
  applyTheme(data.settings.buddy); // undo the preview
  dlg.close();
}

$("settings-save").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("settings-save");
  btn.disabled = true;
  $("settings-note").textContent = "saving…";
  try {
    if (draft.shortcut !== data.settings.shortcut) await app.setShortcut(draft.shortcut);
    data.settings = await updateSettings(draft);
    await reload();
    dlg.close();
    toast("saved");
  } catch (err) {
    logError("settings", err);
    $("settings-note").textContent = String(err);
    btn.disabled = false;
  }
});

async function openSettings() {
  draft = { ...data.settings };
  const grid = $("buddy-grid");
  grid.innerHTML = "";
  pickerBuddies = BUDDIES.map((b) => {
    const opt = document.createElement("button");
    opt.className = "buddy-opt";
    opt.setAttribute("role", "radio");
    opt.setAttribute("aria-checked", String(b.id === draft.buddy));
    opt.dataset.id = b.id;
    const buddy = new Buddy(b.id, { scale: 3, sleepAfterMs: 1e9 });
    opt.append(buddy.el);
    opt.insertAdjacentHTML("beforeend", `<span>${esc(b.name.toLowerCase())}</span><span class="k">${esc(b.kind)}</span>`);
    opt.addEventListener("click", () => {
      grid.querySelectorAll(".buddy-opt").forEach((o) => o.setAttribute("aria-checked", String(o === opt)));
      buddy.react("happy", 700);
      draft.buddy = b.id;
      applyTheme(b.id); // preview only
      markDirty();
    });
    grid.append(opt);
    return buddy;
  });
  $<HTMLInputElement>("opt-pet").checked = draft.desk_pet;
  $<HTMLInputElement>("opt-login").checked = draft.launch_at_login;
  $<HTMLInputElement>("opt-suggest").checked = draft.auto_suggest;
  scBtn.textContent = draft.shortcut;
  $("shortcut-msg").textContent = "click, then press new keys";
  $("data-path").textContent = await app.dataDir();
  $("open-data").hidden = !isTauri;
  $("export").hidden = !isTauri;
  markDirty();
  dlg.showModal();
}

$("opt-pet").addEventListener("change", (e) => { draft.desk_pet = (e.target as HTMLInputElement).checked; markDirty(); });
$("opt-login").addEventListener("change", (e) => { draft.launch_at_login = (e.target as HTMLInputElement).checked; markDirty(); });
$("opt-suggest").addEventListener("change", (e) => { draft.auto_suggest = (e.target as HTMLInputElement).checked; markDirty(); });
$("open-data").addEventListener("click", () => app.openDataDir());
$("export").addEventListener("click", async () => {
  try { const p = await app.exportMarkdown(); if (p) toast("exported to documents"); } catch (err) { toast(String(err)); }
});

// shortcut recorder (also a preview until saved)
const scBtn = $<HTMLButtonElement>("shortcut-btn");
let recording = false;
function stopRecording() { recording = false; scBtn.classList.remove("recording"); scBtn.textContent = draft.shortcut; }
scBtn.addEventListener("click", () => {
  recording = true;
  scBtn.classList.add("recording");
  scBtn.textContent = "press keys…";
  $("shortcut-msg").textContent = "esc to cancel";
});
scBtn.addEventListener("keydown", (e) => {
  if (!recording) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") { stopRecording(); $("shortcut-msg").textContent = "click, then press new keys"; return; }
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
  const key = e.code.startsWith("Key") ? e.code.slice(3) : e.code.startsWith("Digit") ? e.code.slice(5) : e.code;
  if (!mods.length && !/^F\d+$/.test(key)) { $("shortcut-msg").textContent = "add ctrl, alt or shift"; return; }
  draft.shortcut = [...mods, key].join("+");
  $("shortcut-msg").textContent = "applies when you press save changes";
  stopRecording();
  markDirty();
});

function renderShortcutHint() { $("sc-hint").textContent = data.settings.shortcut.toLowerCase(); }

// ---- window chrome -------------------------------------------------------------------
if (isTauri) {
  import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    const w = getCurrentWindow();
    const act = (what: string, p: Promise<unknown>) => p.catch((err) => logError(what, err));
    $("w-min").addEventListener("click", () => act("minimize", w.minimize()));
    $("w-max").addEventListener("click", () => act("maximize", w.toggleMaximize()));
    $("w-close").addEventListener("click", () => act("close", w.close()));
    makeTitlebarDraggable($("app").querySelector<HTMLElement>(".titlebar")!, () => act("maximize", w.toggleMaximize()));
    w.onFocusChanged(({ payload }) => $("app").classList.toggle("inactive", !payload));
  });
  import("@tauri-apps/api/event").then(({ listen }) => listen<string>("library:focus", (e) => {
    view.vault = "all"; view.archived = false; render(); select(e.payload, true);
  }));
} else {
  $("app").querySelector(".titlebar")!.querySelectorAll(".tbtn").forEach((b) => ((b as HTMLElement).hidden = true));
}

// ---- render loop -----------------------------------------------------------------------
function render() {
  renderSide();
  renderList();
  if (!selected || !visible.some((t) => t.id === selected)) selected = visible[0]?.id ?? null;
  thoughtsEl.querySelectorAll<HTMLElement>(".item").forEach((li) => li.setAttribute("aria-selected", String(li.dataset.id === selected)));
  const editing = document.activeElement?.id === "editor" || document.activeElement?.id === "m-tags";
  if (!editing) renderDetail();
  $("status-left").textContent = `${data.thoughts.filter((t) => !t.archived).length} thoughts · saved on this computer`;
}

let loadSeq = 0;
async function reload() {
  const seq = ++loadSeq;
  const fresh = await store.load();
  if (seq !== loadSeq) return; // a newer load is on its way; never paint stale state
  data = fresh;
  applyTheme(data.settings.buddy);
  statusBuddy.setBuddy(data.settings.buddy);
  // one buddy at a time: none here while it lives on the desktop
  statusBuddy.el.hidden = data.settings.desk_pet || data.thoughts.length === 0;
  renderShortcutHint();
  render();
}

// browser preview only: ?demo fills an empty library with sample thoughts
async function seedDemo() {
  const want = new URLSearchParams(location.search).get("buddy");
  if (!isTauri && want) { const st = await store.load(); await store.saveSettings({ ...st.settings, buddy: want }); }
  if (isTauri || !location.search.includes("demo") || (await store.load()).thoughts.length) return;
  const pt = await store.addVault("study", "sage");
  const rd = await store.addVault("reading list", "sky");
  const samples: [string, string | null, string | null, string[]][] = [
    ["have to recap module 5 part 2", pt.id, "To-do", ["study"]],
    ["remember to email priya about the research notes", null, "To-do", ["work"]],
    ["https://www.are.na — save for later", rd.id, "Link", ["reference"]],
    ["chk the new case study in bookmarks", pt.id, "To-do", ["study"]],
    ["call the dentist to book a check-up", null, "To-do", ["errands"]],
  ];
  for (const [text, v, category, tags] of samples.reverse()) {
    const t = await store.addThought(text, v);
    await store.updateThought(t.id, { category, tags });
  }
  const t = await store.addThought("a notes app where the mascot reacts to what you write", null);
  await store.updateThought(t.id, { suggestion: { category: "Idea", tags: ["notes"], vault_id: null } });
}

store.onChange(reload);
seedDemo().then(reload).then(() => {
  thoughtsEl.focus();
  if (!isTauri && location.search.includes("settings")) openSettings();
});
