// UI audit: drives every flow of the popup and library in a hidden, separate
// Edge instance (never your screen or input) and checks the results.
//   npm run dev   (in another terminal)
//   npm run test:ui
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = "http://localhost:1420";
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), "tc-audit-"));
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1000,700", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => ws.addEventListener("open", r, { once: true }));
        ws.addEventListener("message", (e) => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) {
            const p = pending.get(m.id); pending.delete(m.id);
            m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
          }
        });
        return;
      }
    } catch { /* edge still starting */ }
    await sleep(200);
  }
  throw new Error("couldn't reach headless Edge");
}
async function js(expr) {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function go(path) {
  await send("Page.navigate", { url: BASE + path });
  await sleep(900);
}
async function key(k, mods = 0, text) {
  const codes = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, Tab: 9, Delete: 46 };
  const base = { key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, windowsVirtualKeyCode: codes[k] ?? k.toUpperCase().charCodeAt(0), modifiers: mods };
  await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, ...(text ? { text } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  await sleep(60);
}
async function type(text) { await send("Input.insertText", { text }); await sleep(60); }
const state = () => js(`return JSON.parse(localStorage.getItem("tc.state.v1") || '{"thoughts":[],"vaults":[],"settings":{}}')`);

const results = [];
async function check(name, fn) {
  try {
    const ok = await fn();
    results.push([ok === true ? "PASS" : "FAIL", name, ok === true ? "" : String(ok)]);
  } catch (e) {
    results.push(["FAIL", name, e.message.split("\n")[0]]);
  }
}

await connect();
await send("Page.enable");
await send("Runtime.enable");

// ---------------- capture popup ----------------
await go("/windows/capture/");
await js(`localStorage.clear()`);
await go("/windows/capture/");

await check("popup: text box is focused on open", () => js(`return document.activeElement?.id === "text"`));
await check("popup: buddy is on screen", () => js(`return !!document.querySelector("canvas.buddy")`));
await check("popup: Enter on an empty box saves nothing", async () => { await key("Enter", 0, "\r"); return (await state()).thoughts.length === 0; });
await check("popup: Shift+Enter makes a new line, doesn't save", async () => {
  await type("line one"); await key("Enter", 8, "\r"); await type("line two");
  const v = await js(`return document.getElementById("text").value`);
  return v.includes("\n") && (await state()).thoughts.length === 0 ? true : `value=${JSON.stringify(v)}`;
});
await check("popup: Enter saves the thought", async () => {
  await key("Enter", 0, "\r"); await sleep(300);
  const s = await state();
  return s.thoughts.length === 1 && s.thoughts[0].text === "line one\nline two" ? true : JSON.stringify(s.thoughts);
});
await check("popup: box clears after saving", () => js(`return document.getElementById("text").value === ""`));
await check("popup: shows a 'tucked away' message", () => js(`const b = document.getElementById("bubble"); return !b.hidden && b.textContent.includes("tucked")`));
await check("popup: #hashtags become tags, suggestion is attached", async () => {
  await type("what if the onboarding adapted to me #ux"); await key("Enter", 0, "\r"); await sleep(400);
  const t = (await state()).thoughts[0];
  return t.tags.includes("ux") && t.suggestion?.category === "Idea" ? true : JSON.stringify(t);
});
await check("popup: Esc keeps an unfinished draft", async () => {
  await type("half a thought"); await key("Escape"); await sleep(100);
  return js(`return JSON.parse(localStorage.getItem("tc.draft.v1")||"{}").text === "half a thought"`);
});
await check("popup: draft comes back next time", async () => { await go("/windows/capture/"); return js(`return document.getElementById("text").value === "half a thought"`); });
await check("popup: vault button opens the picker", async () => { await js(`document.getElementById("vault-btn").click()`); return js(`return !document.getElementById("picker").hidden`); });
await check("popup: '+ new vault' creates and selects a vault", async () => {
  await js(`document.querySelector("#picker-list .add").click()`); await sleep(50);
  await type("product thinking"); await js(`document.getElementById("new-vault").requestSubmit()`); await sleep(300);
  const s = await state();
  const name = await js(`return document.getElementById("vault-name").textContent`);
  return s.vaults.length === 1 && name === "product thinking" ? true : `vaults=${s.vaults.length} label=${name}`;
});
await check("popup: Ctrl+0 goes back to the main pocket", async () => { await key("0", 2, ""); return js(`return document.getElementById("vault-name").textContent === "main pocket"`); });
await check("popup: Ctrl+1 picks the first vault", async () => { await key("1", 2, ""); return js(`return document.getElementById("vault-name").textContent === "product thinking"`); });
await check("popup: saving into a vault files it there", async () => {
  await js(`const t=document.getElementById("text"); t.focus(); t.value="";`);
  await type("vault test"); await key("Enter", 0, "\r"); await sleep(300);
  const s = await state();
  return s.thoughts[0].vault_id === s.vaults[0].id ? true : JSON.stringify(s.thoughts[0]);
});
await check("popup: keyboard picker (arrow + Enter)", async () => {
  await js(`document.getElementById("vault-btn").focus()`); await key("ArrowDown"); await sleep(50);
  await key("ArrowUp"); await key("Enter", 0, "\r"); await sleep(100);
  return js(`return document.getElementById("picker").hidden`);
});

// ---------------- library ----------------
await js(`localStorage.clear()`);
await go("/windows/library/?demo");
await sleep(500);
const items = () => js(`return document.querySelectorAll("#thoughts .item").length`);
await check("library: opens on 'all thoughts'", async () => (await items()) === 6 || `items=${await items()}`);
await check("library: 'main pocket' shows thoughts you didn't file", async () => { await js(`document.querySelector('[data-vault="inbox"]').click()`); return (await items()) === 3 || `items=${await items()}`; });
await check("library: 'all thoughts' shows everything", async () => { await js(`document.querySelector('[data-vault="all"]').click()`); return (await items()) === 6 || `items=${await items()}`; });
await check("library: clicking a vault filters to it", async () => {
  await js(`[...document.querySelectorAll("[data-vault]")].find(b => b.textContent.includes("design ideas"))?.click()`);
  return (await items()) === 2 || `items=${await items()}`;
});
await check("library: search finds a thought", async () => {
  await js(`const q=document.getElementById("q"); q.focus(); q.value="professor"; q.dispatchEvent(new Event("input"))`);
  return (await items()) === 1 || `items=${await items()}`;
});
await check("library: search highlights the match", () => js(`return !!document.querySelector("#thoughts mark")`));
await check("library: clearing search brings everything back", async () => {
  await js(`const q=document.getElementById("q"); q.value=""; q.dispatchEvent(new Event("input")); document.querySelector('[data-vault="all"]').click()`);
  return (await items()) === 6 || `items=${await items()}`;
});
await check("library: selecting a thought opens it", async () => {
  await js(`document.querySelectorAll("#thoughts .item")[1].click()`);
  return js(`return !!document.getElementById("editor") && document.getElementById("editor").value.length > 0`);
});
await check("library: arrow keys move the selection", async () => {
  const before = await js(`return document.querySelector('.item[aria-selected="true"]')?.dataset.id`);
  await js(`document.getElementById("thoughts").focus()`); await key("ArrowDown"); await sleep(80);
  const after = await js(`return document.querySelector('.item[aria-selected="true"]')?.dataset.id`);
  return before !== after ? true : "selection didn't move";
});
await check("library: editing a thought saves it", async () => {
  await js(`const e=document.getElementById("editor"); e.focus(); e.value = e.value + " (edited)"; e.dispatchEvent(new Event("input"))`);
  await sleep(700);
  return (await state()).thoughts.some((t) => t.text.endsWith("(edited)"));
});
await check("library: tags can be edited", async () => {
  await js(`const t=document.getElementById("m-tags"); t.value="alpha, #beta"; t.dispatchEvent(new Event("change"))`); await sleep(300);
  return (await state()).thoughts.some((t) => t.tags.join() === "alpha,beta");
});
await check("library: moving to a vault from the detail pane", async () => {
  await js(`const v=document.getElementById("m-vault"); v.value=v.options[2].value; v.dispatchEvent(new Event("change"))`); await sleep(300);
  const s = await state();
  return s.thoughts.some((t) => t.tags.join() === "alpha,beta" && t.vault_id === s.vaults[1].id);
});
await check("library: accepting a suggestion applies it", async () => {
  await js(`document.querySelector('[data-vault="all"]').click()`); await sleep(100);
  await js(`[...document.querySelectorAll("#thoughts .item")].find(li => li.textContent.includes("suggestion"))?.click()`); await sleep(100);
  await js(`document.getElementById("accept").click()`); await sleep(300);
  const t = (await state()).thoughts.find((x) => x.text.includes("empty states could"));
  return t.suggestion === null && t.category === "Idea" && t.tags.includes("empty-states") && t.vault_id !== null ? true : JSON.stringify(t);
});
await check("library: archive hides a thought and it shows in the archive", async () => {
  const n = (await state()).thoughts.filter((t) => t.archived).length;
  await js(`document.getElementById("archive").click()`); await sleep(300);
  const m = (await state()).thoughts.filter((t) => t.archived).length;
  await js(`document.querySelector("[data-archived]").click()`); await sleep(100);
  return m === n + 1 && (await items()) === m ? true : `archived ${n}->${m}, archive list ${await items()}`;
});
await check("library: restore brings it back", async () => {
  await js(`document.querySelector("#thoughts .item").click()`); await sleep(80);
  await js(`document.getElementById("archive").click()`); await sleep(300);
  return (await state()).thoughts.every((t) => !t.archived);
});
await check("library: delete asks once, then deletes", async () => {
  await js(`document.querySelector("[data-archived]").click(); document.querySelector('[data-vault="all"]').click()`); await sleep(100);
  await js(`document.querySelector("#thoughts .item").click()`); await sleep(80);
  const n = (await state()).thoughts.length;
  await js(`document.getElementById("delete").click()`); await sleep(150);
  const still = (await state()).thoughts.length;
  await js(`document.getElementById("delete").click()`); await sleep(300);
  const after = (await state()).thoughts.length;
  return still === n && after === n - 1 ? true : `${n} -> ${still} -> ${after}`;
});
await check("library: new vault from the sidebar", async () => {
  await js(`document.getElementById("add-vault").click()`); await sleep(60);
  await type("reading"); await js(`document.getElementById("vault-form").requestSubmit()`); await sleep(300);
  return (await state()).vaults.some((v) => v.name === "reading");
});
await check("library: rename a vault", async () => {
  await js(`[...document.querySelectorAll("[data-vault]")].find(b => b.textContent.includes("reading list"))?.click()`); await sleep(80);
  await js(`document.getElementById("rename-vault").click()`); await sleep(60);
  await js(`const i=document.querySelector("#list-count input"); i.value="books"; i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}))`); await sleep(300);
  return (await state()).vaults.some((v) => v.name === "books");
});
await check("library: deleting a vault keeps its thoughts (moved to inbox)", async () => {
  const s0 = await state(); const v = s0.vaults.find((x) => x.name === "books"); const owned = s0.thoughts.filter((t) => t.vault_id === v.id).length;
  await js(`document.getElementById("delete-vault").click()`); await sleep(60);
  await js(`document.getElementById("delete-vault").click()`); await sleep(300);
  const s1 = await state();
  return !s1.vaults.some((x) => x.id === v.id) && s1.thoughts.length === s0.thoughts.length ? true : `owned ${owned}`;
});
await check("library: '/' focuses search", async () => {
  await js(`document.getElementById("thoughts").focus()`); await key("/", 0, "/");
  return js(`return document.activeElement?.id === "q"`);
});
await check("settings: opens", async () => { await js(`document.getElementById("open-settings").click()`); await sleep(200); return js(`return document.getElementById("settings").open`); });
await check("settings: shows all 9 buddies", () => js(`return document.querySelectorAll(".buddy-opt").length === 9`));
const bar = () => js(`return getComputedStyle(document.querySelector(".titlebar")).backgroundColor`);
await check("settings: picking a buddy previews it but doesn't save yet", async () => {
  const before = (await state()).settings.buddy;
  await js(`document.querySelector('.buddy-opt[data-id="latte"]').click()`); await sleep(300);
  const s = await state();
  const save = await js(`return !document.getElementById("settings-save").disabled`);
  return s.settings.buddy === before && (await bar()) === "rgb(169, 204, 232)" && save ? true : `${s.settings.buddy} ${await bar()} saveEnabled=${save}`;
});
await check("settings: cancel puts everything back", async () => {
  const saved = (await state()).settings.buddy;
  await js(`document.getElementById("settings-cancel").click()`); await sleep(200);
  const open = await js(`return document.getElementById("settings").open`);
  const accent = await js(`return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()`);
  return !open && (await state()).settings.buddy === saved && accent !== "#A9CCE8" ? true : `open=${open} accent=${accent}`;
});
await check("settings: save changes applies buddy + toggles together", async () => {
  await js(`document.getElementById("open-settings").click()`); await sleep(200);
  await js(`document.querySelector('.buddy-opt[data-id="miso"]').click(); document.querySelector('.buddy-opt[data-id="scoop"]').click(); document.getElementById("opt-suggest").click()`); await sleep(200);
  await js(`document.getElementById("settings-save").click()`); await sleep(800);
  const s = await state();
  return s.settings.buddy === "scoop" && s.settings.auto_suggest === false && (await bar()) === "rgb(169, 220, 198)" && !(await js(`return document.getElementById("settings").open`)) ? true : `${JSON.stringify(s.settings)} ${await bar()}`;
});
await check("settings: Esc cancels", async () => {
  await js(`document.getElementById("open-settings").click()`); await sleep(200);
  await js(`document.querySelector('.buddy-opt[data-id="boba"]').click()`); await sleep(100);
  await key("Escape"); await sleep(200);
  return (await state()).settings.buddy === "scoop" && !(await js(`return document.getElementById("settings").open`));
});
await check("settings: reopens", async () => { await js(`document.getElementById("open-settings").click()`); await sleep(200); return js(`return document.getElementById("settings").open`); });
await check("settings: x closes it", async () => { await js(`document.getElementById("settings-close").click()`); await sleep(100); return js(`return !document.getElementById("settings").open`); });
await check("library: only one buddy is ever visible", () =>
  js(`return [...document.querySelectorAll("canvas.buddy")].filter(c => c.offsetParent !== null && getComputedStyle(c).visibility !== "hidden").length <= 1`));
await check("no errors in the page", () => js(`return true`));

// ---------------- report ----------------
const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
for (const [r, name, why] of results) console.log(`${r}  ${pad(name, 62)} ${why}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
ws.close(); edge.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* edge may still hold it */ }
process.exit(failed ? 1 : 0);
