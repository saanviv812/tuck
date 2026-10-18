// Sprite composition for buddies. Pure functions over a char grid, so every
// state shares one grid, one outline and one palette by construction.
// Style rules: 16px-wide loaf bodies, one soft outline colour, flat pastel
// fills, no shading. Personality comes from eyes, timing and tiny poses.
import cast from "./cast.json";

export interface BuddyDef {
  id: string;
  name: string;
  kind: string;
  palette: Record<string, string>;
  eye: { x: number; y: number };
  half: string[];
  tail?: { x: number; y: number; still: string[]; wag: string[] };
  extras?: [number, number, string[]][];
}

const CAST = cast as unknown as { outline: string; buddies: BuddyDef[] };
const EYE_WHITE = "#FFFDF6";
export const BUDDIES: BuddyDef[] = CAST.buddies;
export const OUTLINE = CAST.outline;
// buddies that were retired keep working for people who picked them
const RENAMED: Record<string, string> = { cake: "pup" };
export const byId = (id: string): BuddyDef =>
  BUDDIES.find((b) => b.id === (RENAMED[id] ?? id)) ?? BUDDIES[0];

const BODY = 16; // body width
const ROWS = 16; // body rows (bottom-aligned)
const BX = 3;    // body offset inside the sprite grid (room for tails)
export const GW = BODY + 2 * BX; // sprite grid 22 x 16
export const GH = ROWS;
// Logical canvas: grid plus headroom for hops and marks.
export const CW = GW + 4;
export const CH = GH + 7;
export const OX = 2;
export const OY = 7;
/** canvas row where the feet rest (exclusive bottom of the sprite) */
export const FOOT = OY + GH;

export type Eyes = "open" | "closed" | "happy" | "big" | "sleepy";
export type Pose = "stand" | "breathe" | "hop" | "squash" | "loaf" | "dangle";
export type Mark = "none" | "question" | "bang" | "z" | "heart" | "spark" | "dots";

export interface Frame {
  eyes: Eyes;
  look: { x: number; y: number }; // screen-space, continuous -1..1 (any direction)
  pose: Pose;
  wag: boolean;
  paper: boolean;
  flip: boolean;
  mark: Mark;
  markPhase: number;
}

type Grid = string[][];

function put(g: Grid, x: number, y: number, ch: string) {
  if (x >= 0 && x < GW && y >= 0 && y < GH) g[y][x] = ch;
}

function overlay(g: Grid, ox: number, oy: number, rows: string[]) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") put(g, ox + i, oy + j, ch); }));
}

/** rows padded to the top so every buddy stands on the same baseline */
const pad = (b: BuddyDef) => ROWS - b.half.length;

function base(b: BuddyDef): Grid {
  const g: Grid = Array.from({ length: GH }, () => Array(GW).fill("."));
  const p = pad(b);
  b.half.forEach((row, j) => {
    const r = (row + "........").slice(0, 8);
    [...(r + [...r].reverse().join(""))].forEach((ch, i) => { if (ch !== ".") g[p + j][BX + i] = ch; });
  });
  return g;
}

// Eyes: 2x2 whites. The pupils are NOT part of the grid: paint() draws them
// on top at sub-pixel positions so they can glide in any direction. "E" marks
// each eye's top-left white so the pupils follow poses and flips for free.
function eyes(g: Grid, b: BuddyDef, kind: Eyes) {
  const y = pad(b) + b.eye.y;
  const lx = BX + b.eye.x;
  const rx = BX + BODY - 2 - b.eye.x;
  for (const [x, left] of [[lx, true], [rx, false]] as [number, boolean][]) {
    switch (kind) {
      case "open":
      case "big": {
        const top = kind === "big" ? y - 1 : y;
        for (let j = top; j <= y + 1; j++) { put(g, x, j, "e"); put(g, x + 1, j, "e"); }
        put(g, x, top, "E");
        break;
      }
      case "happy": { // ^ — mirrored so both peaks sit symmetrically
        const x0 = left ? x - 1 : x;
        put(g, x0, y + 1, "#"); put(g, x0 + 1, y, "#"); put(g, x0 + 2, y + 1, "#");
        break;
      }
      case "closed":
      case "sleepy":
        put(g, x, y + 1, "#"); put(g, x + 1, y + 1, "#");
        break;
    }
  }
}

function shiftRows(g: Grid, a: number, z: number, dx: number, dy: number): Grid {
  const out = g.map((r) => r.slice());
  for (let y = a; y < z; y++) out[y] = Array(GW).fill(".");
  for (let y = a; y < z; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= GH) continue;
    for (let x = 0; x < GW; x++) {
      const nx = x + dx;
      if (nx >= 0 && nx < GW && g[y][x] !== ".") out[ny][nx] = g[y][x];
    }
  }
  return out;
}

/** Remove `n` body rows just above the feet; everything above settles down. */
function settle(g: Grid, n: number): Grid {
  const cut = GH - 3; // a plain body row in every buddy
  const out = g.map((r) => r.slice());
  for (let y = cut; y >= 0; y--) out[y] = y - n >= 0 ? g[y - n].slice() : Array(GW).fill(".");
  return out;
}

export function compose(b: BuddyDef, f: Frame): Grid {
  let g = base(b);
  const p = pad(b);
  if (b.tail) overlay(g, BX + b.tail.x, p + b.tail.y, f.wag ? b.tail.wag : b.tail.still);
  for (const [x, y, rows] of b.extras ?? []) overlay(g, BX + x, p + y, rows);
  eyes(g, b, f.eyes);
  switch (f.pose) {
    case "breathe": g = settle(g, 1); break;
    case "squash": g = settle(g, 1); break;
    case "loaf": g = settle(g, 2); break;
    case "hop": g = shiftRows(g, 0, GH, 0, -2); break;
    case "dangle": g = shiftRows(g, 0, GH, 0, -1); break;
  }
  if (f.flip) g = g.map((r) => r.slice().reverse());
  return g;
}

// 5x5 marks beside the head. Never baked into the body.
const MARKS: Record<Exclude<Mark, "none">, string[]> = {
  question: [".##..", "...#.", "..#..", ".....", "..#.."],
  bang: ["#", "#", "#", ".", "#"],
  z: ["####", "..#.", ".#..", "####"],
  heart: [".p.p.", "ppppp", ".ppp.", "..p.."],
  spark: ["y...y", ".....", ".....", "....."],
  dots: [".....", ".....", ".....", ".....", "#.#.#"],
};
const BUTTER = "#F2C45F";
const PINK = "#F08A9C";

/**
 * Paint a frame. `k` = device pixels per sprite pixel (the canvas is CW*k by
 * CH*k). The body stays on the pixel grid; pupils are placed with sub-pixel
 * precision so they can glide smoothly in any direction.
 */
export function paint(ctx: CanvasRenderingContext2D, b: BuddyDef, f: Frame, k = 1) {
  ctx.clearRect(0, 0, CW * k, CH * k);
  const g = compose(b, f);
  const pal = b.palette;
  const px = (x: number, y: number, w = 1, h = 1) => ctx.fillRect(Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k));
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const ch = g[y][x];
      if (ch === ".") continue;
      ctx.fillStyle = ch === "#" ? OUTLINE : ch === "e" || ch === "E" ? EYE_WHITE : pal[ch] ?? OUTLINE;
      px(OX + x, OY + y);
    }

  // pupils: 1 sprite-pixel square, free to sit anywhere inside the white
  ctx.fillStyle = OUTLINE;
  const lx = Math.max(-1, Math.min(1, f.look.x));
  const ly = Math.max(-1, Math.min(1, f.look.y));
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      if (g[y][x] !== "E") continue;
      const left = x + 1 < GW && (g[y][x + 1] === "e") ? x : x - 1; // flipped sprites put E on the right
      let h = 0;
      while (y + h < GH && (g[y + h][left] === "e" || g[y + h][left] === "E")) h++;
      const cx = left + 0.5 + lx * 0.5; // pupil top-left: 0..1 across a 2-wide white
      const cy = y + (h - 1) / 2 + ly * (h - 1) / 2;
      px(OX + cx, OY + cy);
    }

  if (f.mark === "none") return;
  if (f.mark === "spark") {
    const top = OY + pad(b) - (f.pose === "hop" ? 2 : 0);
    const l = OX + BX - 2, r = OX + BX + BODY + 1;
    ctx.fillStyle = BUTTER;
    const lift = f.markPhase ? 1 : 0;
    px(l, top - lift, 1, 2); px(l - 2, top + 2 - lift, 2, 1);
    px(r, top - lift, 1, 2); px(r + 1, top + 2 - lift, 2, 1);
    return;
  }
  const rows = MARKS[f.mark];
  const w = rows[0].length;
  const headTop = OY + pad(b) + (f.pose === "loaf" ? 2 : 0);
  const mx = f.flip ? OX + BX - w : OX + BX + BODY - 1;
  const my = Math.max(0, headTop - rows.length - 1) - (f.markPhase ? 1 : 0);
  rows.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === ".") return;
      ctx.fillStyle = ch === "y" ? BUTTER : ch === "p" ? PINK : OUTLINE;
      px(mx + i, Math.max(0, my + j));
    }),
  );
}

export const defaultFrame = (): Frame => ({
  eyes: "open", look: { x: 0, y: 0 }, pose: "stand", wag: false,
  paper: false, flip: false, mark: "none", markPhase: 0,
});
