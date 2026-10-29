// Builds the extension into extension/dist, which is the folder you load in the browser.
// It reuses the web app's files from ../docs, swaps in a local copy of Firebase,
// and adds the few extension-only files from src/.
//
//   cd extension
//   npm install
//   node build.mjs

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.join(here, "..", "docs");
const dist = path.join(here, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// 1. The web app, without its Firebase-from-the-internet file and without its page.
await cp(docs, dist, {
  recursive: true,
  filter: (source) => !["firebase.js", "session.js", "index.html"].includes(path.basename(source)),
});

// 2. The page, with the popup stylesheet and script added.
let html = await readFile(path.join(docs, "index.html"), "utf8");
const addCss = '<link rel="stylesheet" href="css/style.css">';
const addJs = '<script type="module" src="js/app.js"></script>';
if (!html.includes(addCss) || !html.includes(addJs)) throw new Error("docs/index.html has changed; update build.mjs.");
html = html.replace(addCss, addCss + '\n  <link rel="stylesheet" href="popup.css">').replace(addJs, addJs + '\n  <script type="module" src="extension.js"></script>');
await writeFile(path.join(dist, "popup.html"), html);

// 3. Extension-only files.
await cp(path.join(here, "manifest.json"), path.join(dist, "manifest.json"));
await cp(path.join(here, "src", "popup.css"), path.join(dist, "popup.css"));
await cp(path.join(here, "src", "extension.js"), path.join(dist, "extension.js"));
await cp(path.join(here, "src", "session.js"), path.join(dist, "js", "session.js"));

// 4. Firebase, bundled into one local file.
await build({
  entryPoints: [path.join(here, "firebase-entry.js")],
  outfile: path.join(dist, "js", "firebase.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  logLevel: "warning",
});

console.log("Built extension/dist. In your browser's extensions page, choose Load unpacked and pick that folder.");
