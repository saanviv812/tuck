// Local, rule-based suggestions. Runs AFTER the thought is saved; never edits
// the text; the user accepts or dismisses. Swap `suggest` for another
// implementation (e.g. an opt-in model) without touching callers.
import type { Suggestion, Thought, Vault } from "./types";

export const CATEGORIES = ["Idea", "To-do", "Question", "Link", "Quote", "Note"] as const;

const RULES: [string, RegExp][] = [
  ["Link", /https?:\/\/\S+/i],
  ["To-do", /^(todo|to do|remember to|don't forget|need to|must|buy|call|email|book|pay|fix|send|finish)\b|\b(by (mon|tue|wed|thu|fri|sat|sun|tomorrow|tonight))\b/i],
  ["Idea", /\b(what if|idea:|how might we|could we|imagine|wouldn't it be|app that|product that|feature)\b/i],
  ["Quote", /^["“].+["”](\s*[-—–~]\s*.{1,60})?$/], // "…", optionally followed by — who said it
  ["Question", /\?\s*$|^(why|how|when|where|who|which|is|are|does|do|can|should)\b/i],
];

const STOP = new Set(
  ("a about above after again against all am an and any are as at be because been before being below between both but by " +
    "can could did do does doing down during each few for from further had has have having he her here hers herself him " +
    "himself his how i if in into is it its itself just like me more most my myself no nor not now of off on once only or " +
    "other our ours ourselves out over own same she should so some such than that the their theirs them themselves then " +
    "there these they this those through to too under until up very was we were what when where which while who whom why " +
    "will with would you your yours yourself yourselves thing things really maybe also get got make made want something " +
    "idea what's i'm it's don't dont lets let's way think need know already always never every still might could would should " +
    "today tomorrow yesterday someone something anything everything people really actually probably").split(" "),
);

const words = (s: string) =>
  s.toLowerCase().replace(/https?:\/\/\S+/g, " ").match(/[a-z][a-z'-]{2,}/g) ?? [];

/** #hashtags the user typed are explicit tags, applied straight away. */
export function hashtags(text: string): string[] {
  return [...new Set((text.match(/#([\p{L}\p{N}_-]{2,})/gu) ?? []).map((t) => t.slice(1).toLowerCase()))];
}

function stem(w: string) {
  return w.replace(/(ization|isation)$/, "ize").replace(/(ing|ed|es|s)$/, "");
}

export function suggest(t: Thought, vaults: Vault[], all: Thought[]): Suggestion {
  const text = t.text.trim();
  const category = RULES.find(([, re]) => re.test(text))?.[0] ?? "Note";

  // tags: explicit hashtags, then up to 3 longest distinct content words
  const explicit = hashtags(text);
  // content words; skip adverbs and past-tense verbs, which make poor tags
  const ws = words(text).filter((w) => !STOP.has(w) && w.length > 4 && !/(ly|ed)$/.test(w));
  const seen = new Set(explicit.map(stem));
  const tags = [...explicit];
  for (const w of [...ws].sort((a, b) => b.length - a.length)) {
    if (tags.length >= 3) break;
    const s = stem(w);
    if (!seen.has(s)) { seen.add(s); tags.push(w); }
  }

  // vault: overlap between this text and each vault's name + existing contents
  const mine = new Set(ws.map(stem));
  let best: { id: string; score: number } | null = null;
  for (const v of vaults) {
    let score = 0;
    for (const w of words(v.name)) if (mine.has(stem(w))) score += 3;
    const inVault = all.filter((x) => x.vault_id === v.id && x.id !== t.id).slice(0, 80);
    const bag = new Map<string, number>();
    for (const x of inVault) {
      for (const w of new Set([...words(x.text), ...x.tags].map(stem))) bag.set(w, (bag.get(w) ?? 0) + 1);
    }
    for (const w of mine) score += Math.min(2, bag.get(w) ?? 0) * 0.75;
    if (score >= 1.5 && (!best || score > best.score)) best = { id: v.id, score };
  }

  return { category, tags, vault_id: t.vault_id ? null : best?.id ?? null };
}
