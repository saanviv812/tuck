// Single data API for every window. In the desktop app the Rust side owns
// the file (atomic writes, one writer) and broadcasts "store:changed".
// In a plain browser (design preview) it falls back to localStorage.
import { DEFAULT_SETTINGS, type Settings, type State, type Thought, type Vault } from "./types";

export const isTauri = "__TAURI_INTERNALS__" in window;

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
let _invoke: Invoke | null = null;
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!_invoke) _invoke = (await import("@tauri-apps/api/core")).invoke as Invoke;
  return _invoke<T>(cmd, args);
}

// ---- browser fallback ------------------------------------------------------
const LS_KEY = "tc.state.v1";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function lsLoad(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
      return s;
    }
  } catch { /* fall through to a fresh state */ }
  return { thoughts: [], vaults: [], settings: { ...DEFAULT_SETTINGS } };
}
const localListeners: (() => void)[] = [];
function lsSave(s: State) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
  bc?.postMessage("changed"); // other tabs
  queueMicrotask(() => localListeners.forEach((cb) => cb())); // and this one, like the app does
}
const bc = "BroadcastChannel" in window ? new BroadcastChannel("tc") : null;

// ---- public API ------------------------------------------------------------
export const store = {
  async load(): Promise<State> {
    if (isTauri) return invoke<State>("load_state");
    return lsLoad();
  },

  async addThought(text: string, vault_id: string | null): Promise<Thought> {
    if (isTauri) return invoke<Thought>("add_thought", { text, vaultId: vault_id });
    const s = lsLoad();
    const now = Date.now();
    const t: Thought = {
      id: uid(), text, created_at: now, updated_at: now, vault_id,
      category: null, tags: [], suggestion: null, archived: false,
    };
    s.thoughts.unshift(t);
    lsSave(s);
    return t;
  },

  async updateThought(id: string, patch: Partial<Thought>): Promise<Thought> {
    if (isTauri) return invoke<Thought>("update_thought", { id, patch });
    const s = lsLoad();
    const t = s.thoughts.find((x) => x.id === id);
    if (!t) throw new Error("Thought not found");
    Object.assign(t, patch, { updated_at: Date.now() });
    lsSave(s);
    return t;
  },

  async deleteThought(id: string): Promise<void> {
    if (isTauri) return invoke("delete_thought", { id });
    const s = lsLoad();
    s.thoughts = s.thoughts.filter((x) => x.id !== id);
    lsSave(s);
  },

  async addVault(name: string, color: string): Promise<Vault> {
    if (isTauri) return invoke<Vault>("add_vault", { name, color });
    const s = lsLoad();
    const v: Vault = { id: uid(), name, color, created_at: Date.now() };
    s.vaults.push(v);
    lsSave(s);
    return v;
  },

  async updateVault(id: string, name: string, color: string): Promise<void> {
    if (isTauri) return invoke("update_vault", { id, name, color });
    const s = lsLoad();
    const v = s.vaults.find((x) => x.id === id);
    if (v) Object.assign(v, { name, color });
    lsSave(s);
  },

  async deleteVault(id: string): Promise<void> {
    if (isTauri) return invoke("delete_vault", { id });
    const s = lsLoad();
    s.vaults = s.vaults.filter((x) => x.id !== id);
    s.thoughts.forEach((t) => { if (t.vault_id === id) t.vault_id = null; });
    lsSave(s);
  },

  async saveSettings(settings: Settings): Promise<Settings> {
    if (isTauri) return invoke<Settings>("save_settings", { settings });
    const s = lsLoad();
    s.settings = settings;
    lsSave(s);
    return settings;
  },

  /** Re-run callback whenever any window changes the data. */
  async onChange(cb: () => void): Promise<void> {
    if (isTauri) {
      const { listen } = await import("@tauri-apps/api/event");
      await listen("store:changed", cb);
    } else {
      localListeners.push(cb);
      bc?.addEventListener("message", cb);
      window.addEventListener("storage", (e) => { if (e.key === LS_KEY) cb(); });
    }
  },
};

/** Drag the window from its title bar, but never from the buttons in it. */
export async function makeTitlebarDraggable(bar: HTMLElement, onDoubleClick?: () => void) {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const w = getCurrentWindow();
  bar.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, select, a")) return;
    if (e.detail === 2) { onDoubleClick?.(); return; }
    w.startDragging().catch((err) => logError("drag", err));
  });
}

// any uncaught error in any window ends up in app.log
if (isTauri) {
  addEventListener("error", (e) => logError(`uncaught (${location.pathname})`, e.error ?? e.message));
  addEventListener("unhandledrejection", (e) => logError(`unhandled (${location.pathname})`, e.reason));
}

/** Record a failure somewhere a user (or developer) can find it later. */
export function logError(where: string, err: unknown) {
  const msg = `${where}: ${err instanceof Error ? err.message : String(err)}`;
  console.warn(msg);
  if (isTauri) invoke("log_line", { level: "error", msg }).catch(() => {});
}

let settingsQueue: Promise<unknown> = Promise.resolve();
/** Change some settings. Saves run one at a time, each on top of the latest
 *  saved settings, so quick clicks can never undo each other. */
export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const run = settingsQueue.then(async () => {
    const current = (await store.load()).settings;
    return store.saveSettings({ ...current, ...patch });
  });
  settingsQueue = run.catch(() => {});
  return run;
}

/** Native helpers; no-ops in the browser preview. */
export const app = {
  invoke,
  async hideCapture() { if (isTauri) await invoke("hide_capture"); },
  async openLibrary(thoughtId?: string) { if (isTauri) await invoke("open_library", { thoughtId: thoughtId ?? null }); else window.open("/windows/library/?demo", "_blank"); },
  async openCapture() { if (isTauri) await invoke("open_capture"); else window.open("/windows/capture/", "_blank"); },
  async setShortcut(accel: string): Promise<void> { if (isTauri) await invoke("set_shortcut", { accel }); },
  /** Desktop-wide cursor in this window's coordinates, pushed only when it moves. */
  async onCursor(cb: (x: number, y: number) => void) {
    if (!isTauri) { addEventListener("pointermove", (e) => cb(e.clientX, e.clientY)); return; }
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await getCurrentWebviewWindow().listen<{ x: number; y: number }>("cursor", (e) => cb(e.payload.x, e.payload.y));
  },
  async dataDir(): Promise<string> { return isTauri ? invoke<string>("data_dir") : "(browser localStorage)"; },
  async openDataDir() { if (isTauri) await invoke("open_data_dir"); },
  async exportMarkdown(): Promise<string | null> { return isTauri ? invoke<string>("export_markdown") : null; },
};
