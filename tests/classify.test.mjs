// Unit tests for the suggestion rules (src/lib/classify.ts).
//   npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const out = await build({
  entryPoints: [fileURLToPath(new URL("../src/lib/classify.ts", import.meta.url))],
  bundle: true, write: false, format: "esm", platform: "node",
});
const { suggest, hashtags } = await import("data:text/javascript," + encodeURIComponent(out.outputFiles[0].text));

const t = (text, vault_id = null) => ({ id: Math.random().toString(36), text, created_at: 0, updated_at: 0, vault_id, category: null, tags: [], suggestion: null, archived: false });
const kind = (text) => suggest(t(text), [], []).category;

test("types come from simple phrasing", () => {
  assert.equal(kind("https://lawsofux.com save for later"), "Link");
  assert.equal(kind("email the professor about the review"), "To-do");
  assert.equal(kind("finish the slides by friday"), "To-do");
  assert.equal(kind("what if the popup remembered my last pocket"), "Idea");
  assert.equal(kind("why do settings pages hide things?"), "Question");
  assert.equal(kind('"less, but better" — dieter rams'), "Quote");
  assert.equal(kind("module 5 part 2 covers usability heuristics"), "Note");
});

test("a link wins over other patterns", () => {
  assert.equal(kind("remember to read https://example.com"), "Link");
});

test("#hashtags become tags, lowercased and deduped", () => {
  assert.deepEqual(hashtags("plan #Uni stuff #uni #design"), ["uni", "design"]);
  const s = suggest(t("recap the heuristics lecture #uni"), [], []);
  assert.equal(s.tags[0], "uni");
  assert.ok(s.tags.length <= 3);
});

test("tags skip common words, adverbs and past tense", () => {
  const s = suggest(t("really quickly finished the onboarding research"), [], []);
  assert.ok(!s.tags.includes("really"));
  assert.ok(!s.tags.includes("quickly"));
  assert.ok(!s.tags.includes("finished"));
  assert.ok(s.tags.includes("onboarding"));
});

test("a pocket is suggested when the words match it", () => {
  const study = { id: "v1", name: "study", color: "sage", created_at: 0 };
  const s = suggest(t("study notes for the exam"), [study], []);
  assert.equal(s.vault_id, "v1");
});

test("no pocket is suggested when nothing matches, or one is already chosen", () => {
  const study = { id: "v1", name: "study", color: "sage", created_at: 0 };
  assert.equal(suggest(t("call the dentist"), [study], []).vault_id, null);
  assert.equal(suggest(t("study notes", "v1"), [study], []).vault_id, null);
});

test("it never touches the original text", () => {
  const thought = t("What if  Onboarding?? #UX");
  suggest(thought, [], []);
  assert.equal(thought.text, "What if  Onboarding?? #UX");
});
