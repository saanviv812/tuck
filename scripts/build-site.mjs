// Builds the website into one self-contained file (CSS, JS and the font are
// inlined), so it works on GitHub Pages or anywhere else with no build step.
//   npm run site            → site/dist/index.html  (full page)
//                             site/dist/preview.html (body-only, for preview hosts)
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "https://github.com/saanviv812/tuck";
const RELEASES = `${REPO}/releases/latest`;

const js = (await build({
  entryPoints: [join(root, "site/main.ts")],
  bundle: true, minify: true, write: false, format: "iife", target: "es2021",
})).outputFiles[0].text;

const font = readFileSync(join(root, "src/assets/fonts/DepartureMono-Regular.woff2")).toString("base64");
const tokens = readFileSync(join(root, "src/styles/tokens.css"), "utf8")
  .replace(/url\("[^"]*DepartureMono-Regular\.woff2"\)/, `url("data:font/woff2;base64,${font}")`);
const css = (await build({
  stdin: { contents: tokens + "\n" + readFileSync(join(root, "site/site.css"), "utf8"), loader: "css" },
  minify: true, write: false,
})).outputFiles[0].text;

const body = readFileSync(join(root, "site/template.html"), "utf8")
  .replace("/*{{CSS}}*/", () => css)
  .replace("/*{{JS}}*/", () => js.replace(/<\/script/gi, "<\\/script"))
  .replaceAll("{{RELEASES}}", RELEASES)
  .replaceAll("{{REPO}}", REPO);

const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta property="og:title" content="tuck">
<meta property="og:description" content="catch thoughts before they fly off. a tiny windows app with a pixel buddy.">
${body.split("<style>")[0]}<style>${body.split("<style>")[1].split("</style>")[0]}</style>
</head>
<body>
${body.split("</style>")[1]}
</body>
</html>
`;

mkdirSync(join(root, "site/dist"), { recursive: true });
writeFileSync(join(root, "site/dist/index.html"), full);
writeFileSync(join(root, "site/dist/preview.html"), body);
console.log(`site/dist/index.html  ${(full.length / 1024).toFixed(0)} KB`);
