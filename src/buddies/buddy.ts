// Buddy: a living sprite. Owns its canvas, blinks, breathes, follows the
// cursor with its eyes, waddles along a perch, and reacts to events.
// Personality comes from timing; motion stays small and purposeful.
import { byId, CH, CW, defaultFrame, FOOT, OX, paint, type BuddyDef, type Frame, type Mark } from "./sprite";

export type Mood = "idle" | "curious" | "think" | "save" | "happy" | "poke" | "sleep" | "held" | "fall";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface BuddyOptions {
  scale: number;
  /** Width in CSS px of the perch the buddy may waddle along. 0 = sit still. */
  perch?: number;
  /** Starting x (CSS px) on the perch. */
  x?: number;
  sleepAfterMs?: number;
  onPoke?: () => void;
  onDoubleClick?: () => void;
  /** Hand a drag to the host (e.g. move the whole window) instead of the perch. */
  onDragStart?: () => void;
}

export class Buddy {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private def: BuddyDef;
  private f: Frame = defaultFrame();
  private mood: Mood = "idle";
  private moodUntil = 0;
  private lastKey = "";
  private raf = 0; // timer id
  private k = 1;
  /** where the eyes are actually looking (eased toward the target) */
  private gazeNow = { x: 0.4, y: 0.4 };
  private nextBlink = 0;
  private blinkUntil = 0;
  private breathT = 0;
  private lastInput = performance.now();
  private gaze = { x: 0.4, y: 0.4 }; // target, continuous -1..1
  private gazeOverride: { x: number; y: number } | null = null;
  // perch walking
  private x: number;
  private targetX: number | null = null;
  private stepT = 0;
  private nextWander = performance.now() + rand(4000, 9000);
  // drag / fall
  private y = 0;
  private vy = 0;
  private dragging = false;
  private dragMoved = false;
  private dragStart = { x: 0, y: 0, bx: 0 };
  private extWalk = 0;
  private napping = false;
  private destroyed = false;
  private paused = false;

  constructor(id: string, private opts: BuddyOptions) {
    // snap to whole screen pixels so sprites stay crisp at 125%, 150%… scaling
    const dpr = window.devicePixelRatio || 1;
    opts.scale = Math.max(1, Math.round(opts.scale * dpr)) / dpr;
    this.def = byId(id);
    this.k = Math.max(1, Math.round(opts.scale * dpr)); // device px per sprite px
    this.el = document.createElement("canvas");
    this.el.width = CW * this.k;
    this.el.height = CH * this.k;
    this.el.className = "buddy";
    this.el.style.width = `${CW * opts.scale}px`;
    this.el.style.height = `${CH * opts.scale}px`;
    this.el.setAttribute("role", "img");
    this.el.setAttribute("aria-label", `${this.def.name} the ${this.def.kind}`);
    this.ctx = this.el.getContext("2d")!;
    this.x = opts.x ?? 0;
    this.nextBlink = performance.now() + rand(1500, 4000);
    this.bindPointer();
    this.loop = this.loop.bind(this);
    this.raf = window.setTimeout(() => this.loop(performance.now()), 0);
  }

  get name() { return this.def.name; }
  get width() { return CW * this.opts.scale; }

  setBuddy(id: string) {
    this.def = byId(id);
    this.el.setAttribute("aria-label", `${this.def.name} the ${this.def.kind}`);
    this.lastKey = "";
  }

  setPerch(width: number) {
    this.opts.perch = width;
    this.x = Math.min(this.x, Math.max(0, width - this.width));
  }

  /** Point the eyes toward a screen/page position (same space as the canvas rect). */
  lookAt(px: number, py: number) {
    const r = this.el.getBoundingClientRect();
    const s = this.opts.scale;
    const ex = r.left + (OX + 11) * s; // between the eyes
    const ey = r.top + (FOOT - 9) * s;
    const dx = px - ex;
    const dy = py - ey;
    const d = Math.hypot(dx, dy);
    if (d < 1) { this.gaze = { x: 0, y: 0 }; return; }
    // any direction; reaches the edge of the eye once the cursor is ~a buddy away
    const reach = Math.min(1, d / (CW * s * 1.2));
    this.gaze = { x: (dx / d) * reach, y: (dy / d) * reach };
  }

  /** Force a gaze direction (e.g. down at the text while typing). null releases. */
  gazeAt(dir: { x: number; y: number } | null) { this.gazeOverride = dir; }

  /** Any user activity keeps the buddy awake. */
  nudge() {
    if (this.napping) return; // a requested nap only ends on wake() or a poke
    const was = this.mood;
    this.lastInput = performance.now();
    if (was === "sleep") this.react("curious", 900);
  }

  react(mood: Mood, ms = 1200) {
    this.mood = mood;
    this.moodUntil = performance.now() + ms;
    this.targetX = null;
    if (mood !== "sleep") this.lastInput = performance.now();
  }

  /** Walk to an x on the perch (CSS px). */
  walkTo(x: number) {
    if (!this.opts.perch || reducedMotion()) return;
    this.targetX = Math.max(0, Math.min(this.opts.perch - this.width, x));
  }

  /** Lie down for a nap until wake() or a poke. */
  nap() {
    this.napping = true;
    this.targetX = null;
    this.extWalk = 0;
    this.mood = "sleep";
  }

  wake() {
    this.napping = false;
    this.react("curious", 900);
  }

  get isNapping() { return this.napping; }

  /** Stop animating while off screen (hidden windows still run timers). */
  pause(on: boolean) {
    this.paused = on;
    if (!on) { clearTimeout(this.raf); this.raf = window.setTimeout(() => this.loop(performance.now()), 0); }
  }

  /** Show walking frames while something else moves the buddy (-1 left, 1 right, 0 stop). */
  setWalking(dir: number) {
    this.extWalk = Math.sign(dir);
    if (dir) this.lastInput = performance.now();
  }

  get isIdle() { return this.mood === "idle"; }
  get isAsleep() { return this.mood === "sleep"; }

  destroy() { clearTimeout(this.raf); this.destroyed = true; }

  private bindPointer() {
    const el = this.el;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.dragMoved = false;
      this.dragStart = { x: e.clientX, y: e.clientY, bx: this.x };
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      if (!this.dragMoved && Math.hypot(dx, dy) < 4) return;
      this.dragMoved = true;
      if (this.opts.onDragStart) {
        this.dragging = false;
        this.react("curious", 900);
        this.opts.onDragStart();
        return;
      }
      this.mood = "held";
      this.targetX = null;
      if (this.opts.perch) this.x = Math.max(0, Math.min(this.opts.perch - this.width, this.dragStart.bx + dx));
      this.y = Math.min(0, dy);
    });
    const up = () => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.dragMoved) {
        this.mood = "fall";
        this.vy = 0;
      } else {
        this.napping = false;
        this.react("poke", 1100);
        this.opts.onPoke?.();
      }
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("dblclick", () => this.opts.onDoubleClick?.());
  }

  // Pixel sprites need ~12 fps, not 60: a fixed, slow tick keeps idle CPU near
  // zero. Sleeping buddies tick even slower; hidden pages are skipped.
  private loop(now: number) {
    if (this.destroyed) return;
    // ease the eyes toward where they want to look — smooth, never snappy
    const want = this.gazeOverride ?? this.gaze;
    const gx = want.x - this.gazeNow.x, gy = want.y - this.gazeNow.y;
    const gazing = Math.abs(gx) > 0.01 || Math.abs(gy) > 0.01;
    if (gazing) { this.gazeNow = { x: this.gazeNow.x + gx * 0.28, y: this.gazeNow.y + gy * 0.28 }; }
    else this.gazeNow = { ...want };
    const busy = this.mood !== "idle" && this.mood !== "sleep" || this.targetX !== null || this.extWalk !== 0 || this.dragging;
    // idle: sleep until the next thing that can actually change (breath beat
    // or blink) — about 1–3 wakes a second instead of polling
    const period = this.mood === "sleep" ? 1400 : 1000;
    const nextBeat = Math.ceil((now + 1) / period) * period - now;
    const nextBlink = now < this.blinkUntil ? this.blinkUntil - now : this.nextBlink - now;
    const idleWait = Math.max(30, Math.min(nextBeat, nextBlink, 1000));
    const interval = this.paused || document.hidden ? 1000 : gazing ? 16 : busy ? 83 : idleWait;
    this.raf = window.setTimeout(() => this.loop(performance.now()), interval);
    if (this.paused || document.hidden) return;
    const still = reducedMotion();
    const f: Frame = { ...defaultFrame(), flip: this.f.flip };
    const s = this.opts.scale;

    // mood expiry
    if (this.mood !== "sleep" && this.mood !== "held" && this.mood !== "fall" && this.moodUntil && now > this.moodUntil) {
      this.mood = "idle";
      this.moodUntil = 0;
    }
    if (this.mood === "idle" && now - this.lastInput > (this.opts.sleepAfterMs ?? 45000)) this.mood = "sleep";

    // breathing: a slow 2-beat cycle
    this.breathT = (now / period) % 2;
    const beat = this.breathT < 1 ? 0 : 1;

    // blinking
    if (now > this.nextBlink) {
      this.blinkUntil = now + 190;
      this.nextBlink = now + rand(2200, 6000) + (Math.random() < 0.2 ? -1800 : 0); // occasional double blink
    }
    const blinking = now < this.blinkUntil;

    f.look = { x: Math.round(this.gazeNow.x * 20) / 20, y: Math.round(this.gazeNow.y * 20) / 20 };
    f.eyes = blinking ? "closed" : "open";
    f.pose = !still && beat ? "breathe" : "stand";

    // walking along the perch
    let walking = false;
    if (this.mood === "idle" && this.opts.perch && !still) {
      if (this.targetX === null && now > this.nextWander) {
        this.walkTo(rand(0, this.opts.perch - this.width));
        this.nextWander = now + rand(7000, 16000);
      }
      if (this.targetX !== null) {
        const dx = this.targetX - this.x;
        if (Math.abs(dx) < s) {
          this.targetX = null;
        } else {
          walking = true;
          f.flip = dx < 0;
          this.stepT += 1;
          this.x += Math.sign(dx) * s; // 1 sprite pixel per tick (~12 px/s)
          f.pose = Math.floor(this.stepT / 2) % 2 ? "stand" : "squash";
          f.wag = Math.floor(this.stepT / 2) % 2 === 0;
          f.look = { x: f.flip ? -1 : 1, y: 0 }; // screen space; compose() handles the mirror
        }
      }
    }

    if (this.extWalk && (this.mood === "idle" || this.mood === "sleep") && !still) {
      this.mood = "idle";
      walking = true;
      f.flip = this.extWalk < 0;
      this.stepT += 1;
      f.pose = Math.floor(this.stepT / 2) % 2 ? "stand" : "squash";
      f.wag = Math.floor(this.stepT / 2) % 2 === 0;
      f.look = { x: this.extWalk, y: 0 };
    }

    const phase = Math.floor(now / 380) % 2;
    switch (this.mood) {
      case "curious":
        f.eyes = blinking ? "closed" : "big"; f.mark = "bang"; f.markPhase = phase;
        break;
      case "think":
        f.look = { x: 1, y: -1 }; f.mark = "question"; f.markPhase = phase;
        break;
      case "save": {
        const t = 1 - (this.moodUntil - now) / 900;
        f.eyes = t < 0.3 ? "open" : "happy";
        f.pose = still ? "stand" : t > 0.35 && t < 0.7 ? "hop" : t >= 0.7 ? "squash" : "stand";
        f.mark = t > 0.35 ? "spark" : "none"; f.markPhase = phase;
        f.wag = true;
        break;
      }
      case "happy":
        f.eyes = "happy"; f.pose = still ? "stand" : phase ? "hop" : "squash"; f.wag = true; f.mark = "spark"; f.markPhase = phase;
        break;
      case "poke":
        f.eyes = "happy"; f.mark = "heart"; f.markPhase = phase; f.wag = true;
        f.pose = still ? "stand" : now < this.moodUntil - 800 ? "squash" : "stand";
        break;
      case "sleep":
        f.eyes = "sleepy"; f.mark = "z"; f.markPhase = beat; f.pose = "loaf";
        break;
      case "held":
        f.eyes = "big"; f.pose = "dangle"; f.wag = phase === 1; f.look = { x: 0, y: 1 };
        break;
      case "fall":
        this.vy += 5;
        this.y = Math.min(0, this.y + this.vy);
        f.eyes = "big"; f.pose = "dangle";
        if (this.y >= 0) { this.y = 0; this.react("happy", 500); }
        break;
    }
    if (!walking && this.mood === "idle" && beat === 1 && Math.floor(now / period) % 7 === 3) f.wag = true; // a tail flick now and then

    this.f = f;
    this.el.style.transform = `translate(${Math.round(this.x / s) * s}px, ${Math.round(this.y / s) * s}px)`;
    const key = JSON.stringify(f);
    if (key !== this.lastKey) {
      paint(this.ctx, this.def, f, this.k);
      this.lastKey = key;
    }
  }

  /** Show a mark briefly without changing mood. */
  flash(mark: Mark) {
    this.react(mark === "question" ? "think" : "curious", 900);
  }
}
