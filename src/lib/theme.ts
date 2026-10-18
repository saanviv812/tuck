// The whole app takes its colour from the chosen buddy: title bar in the
// buddy's own colour, paper, desk, bevels and selection gently tinted by it.
import { byId } from "../buddies/sprite";

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const A = rgb(a), B = rgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
};

export function applyTheme(buddyId: string) {
  const c = byId(buddyId).palette.o;
  const root = document.documentElement.style;
  root.setProperty("--accent", c);
  root.setProperty("--face", mix("#FFFDF6", c, 0.07));
  root.setProperty("--field", mix("#FFFFFF", c, 0.025));
  root.setProperty("--desk", mix("#F6EFE2", c, 0.22));
  root.setProperty("--lo", mix("#EADFCF", c, 0.28));
  root.setProperty("--lo-2", mix("#D6C6B1", c, 0.3));
  root.setProperty("--select", mix("#FFFFFF", c, 0.42));
}
