// Dev-only contact sheet: every buddy in every state, for visual review.
import { BUDDIES, CH, CW, defaultFrame, paint, type Frame } from "../buddies/sprite";

const S = Number(new URLSearchParams(location.search).get("s") ?? 5);
const states: [string, Partial<Frame>][] = [
  ["idle", {}],
  ["blink", { eyes: "closed" }],
  ["look ←", { look: { x: -1, y: 0 } }],
  ["look ↗", { look: { x: 1, y: -1 } }],
  ["look ↓", { look: { x: 0, y: 1 } }],
  ["look ↙", { look: { x: -0.7, y: 0.7 } }],
  ["slightly ↗", { look: { x: 0.35, y: -0.35 } }],
  ["centre", { look: { x: 0, y: 0 } }],
  ["happy", { eyes: "happy", pose: "hop", wag: true, mark: "spark" }],
  ["thinking", { look: { x: 1, y: -1 }, mark: "question" }],
  ["surprised", { eyes: "big", mark: "bang" }],
  ["saving", { eyes: "happy", pose: "squash", mark: "spark" }],
  ["poke", { eyes: "happy", mark: "heart" }],
  ["sleepy", { eyes: "sleepy", pose: "loaf", mark: "z" }],
  ["walk", { flip: true, pose: "squash", wag: true, look: { x: -1, y: 0 } }],
];

const root = document.getElementById("root")!;
// ?cast : one tidy row of every buddy, for the README
if (new URLSearchParams(location.search).has("cast")) {
  const row = document.createElement("div");
  row.className = "row";
  row.style.gap = "18px";
  for (const b of BUDDIES) {
    const fig = document.createElement("figure");
    const c = document.createElement("canvas");
    c.width = CW * S; c.height = CH * S;
    c.style.width = `${CW * S}px`; c.style.height = `${CH * S}px`;
    paint(c.getContext("2d")!, b, { ...defaultFrame(), look: { x: 0.3, y: 0.4 } }, S);
    const cap = document.createElement("figcaption");
    cap.innerHTML = `${b.name.toLowerCase()}<br><span style="color:#A8968A">${b.kind}</span>`;
    fig.append(c, cap);
    row.append(fig);
  }
  root.append(row);
  throw new Error("cast only"); // stop here; skip the full sheet
}
for (const b of BUDDIES.filter((x) => !new URLSearchParams(location.search).get("only") || x.id === new URLSearchParams(location.search).get("only"))) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<div class="name">${b.name}<br><span style="color:#7A6556">${b.kind}</span></div>`;
  for (const [label, patch] of states) {
    const fig = document.createElement("figure");
    const c = document.createElement("canvas");
    c.width = CW * S; c.height = CH * S;
    c.style.width = `${CW * S}px`; c.style.height = `${CH * S}px`;
    paint(c.getContext("2d")!, b, { ...defaultFrame(), ...patch }, S);
    fig.append(c);
    const cap = document.createElement("figcaption");
    cap.textContent = label;
    fig.append(cap);
    row.append(fig);
  }
  root.append(row);
}
