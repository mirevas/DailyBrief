#!/usr/bin/env node
/**
 * Build the static site that gets published to GitHub Pages (or any static
 * host). Run AFTER `npm run daily` has produced today's report.
 *
 * Writes into daily_reports/ (already the publish dir):
 *   - index.html      copy of the latest <date>/<date>.html
 *   - archive.html    table of every <date>/<date>.html, newest first
 *
 * Existing per-date subdirs are left untouched. Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/build-site.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { writeHolaPage } from "./language/render-page.mjs";

const ROOT = "daily_reports";

if (!fs.existsSync(ROOT)) {
  console.error(`[build-site] ${ROOT}/ doesn't exist — run \`npm run daily\` first.`);
  process.exit(1);
}

// Pick up every <YYYY-MM-DD>/<YYYY-MM-DD>.html, newest first.
const dates = fs
  .readdirSync(ROOT)
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  .filter((d) => fs.existsSync(path.join(ROOT, d, `${d}.html`)))
  .sort((a, b) => b.localeCompare(a));

if (dates.length === 0) {
  console.error(`[build-site] no <YYYY-MM-DD>/<YYYY-MM-DD>.html found in ${ROOT}/`);
  process.exit(1);
}

// --- index.html = latest report ---
const latest = dates[0];
const latestPath = path.join(ROOT, latest, `${latest}.html`);
let latestHtml = fs
  .readFileSync(latestPath, "utf8")
  .replace(/href="\.\.\/archive\.html"/g, 'href="./archive.html"')
  .replace(/href="\.\.\/hola\.html"/g, 'href="./hola.html"');
const isChineseReport = /<html lang="zh/i.test(latestHtml);
const archiveLinkLabel = isChineseReport ? "→ 历史归档" : "→ Archive";
const learnSpanishLinkLabel = "→ Hola!";
const headerLinks = `<div class="header-links"><a class="archive-link" href="./archive.html">${archiveLinkLabel}</a><a class="archive-link" href="./hola.html">${learnSpanishLinkLabel}</a></div>`;
if (/<div class="header-links">[\s\S]*?<\/div>/.test(latestHtml)) {
  latestHtml = latestHtml.replace(/<div class="header-links">[\s\S]*?<\/div>/, headerLinks);
} else {
  latestHtml = latestHtml.replace("</header>", `${headerLinks}\n  </header>`);
}
fs.writeFileSync(path.join(ROOT, "index.html"), latestHtml, "utf8");
console.log(`[build-site] index.html  ← ${latest}/${latest}.html`);

// --- archive.html = list of all reports ---
const rows = dates
  .map((d) => {
    const size = (fs.statSync(path.join(ROOT, d, `${d}.html`)).size / 1024).toFixed(0);
    return `      <li><a href="./${d}/${d}.html">${d}</a> <span class="size">${size} KB</span></li>`;
  })
  .join("\n");

const archiveHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>daily-brief — archive</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme:light; --bg:#fafaf9; --bg-elevated:#fff; --fg:#18181b; --fg-soft:#3f3f46; --muted:#71717a; --rule:#e4e4e7; --card:#f4f4f5; --link:#1d4ed8; --accent:#18181b; --accent-fg:#fafaf9; }
  @media(prefers-color-scheme:dark) { :root { color-scheme:dark; --bg:#0a0a0a; --bg-elevated:#18181b; --fg:#fafafa; --fg-soft:#d4d4d8; --muted:#a1a1aa; --rule:#27272a; --card:#18181b; --link:#93c5fd; --accent:#fafafa; --accent-fg:#0a0a0a; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif; line-height:1.6; -webkit-font-smoothing:antialiased; }
  main { max-width:960px; margin:0 auto; padding:2.5rem 1.5rem 4rem; }
  .eyebrow { display:block; color:var(--muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.2em; font-weight:500; }
  h1 { margin:.4rem 0 .45rem; font-size:2rem; letter-spacing:-.02em; line-height:1.1; }
  .meta { color:var(--muted); font-size:.88rem; margin:0 0 1.2rem; }
  ul { list-style:none; padding:0; margin:0; }
  li { padding:.7rem .85rem; border:1px solid var(--rule); border-radius:.5rem; background:var(--bg-elevated); margin:.45rem 0; display:flex; justify-content:space-between; align-items:center; gap:1rem; }
  li a { color:var(--link); text-decoration:none; }
  li a:hover { text-decoration:underline; }
  .size { color:var(--muted); font-size:.82rem; white-space:nowrap; }
  .back-to-menu { display:none; }
  .top { margin:0 0 1.5rem; padding:.9rem 1.1rem; background:var(--card); border:1px solid var(--rule); border-left:4px solid var(--accent); border-radius:.6rem; display:flex; flex-direction:column; align-items:flex-start; gap:.45rem; }
  .top a { color:var(--link); text-decoration:none; font-size:.9rem; border-bottom:1px dashed var(--rule); }
  .top a:hover { border-bottom-style:solid; }
  @media(max-width:719px) {
    main { padding:1.35rem 1rem 3rem; }
    h1 { font-size:2rem; }
    li { padding:.7rem .75rem; }
    .back-to-menu { position:fixed; z-index:10; right:max(1.25rem,env(safe-area-inset-right)); bottom:max(1.25rem,env(safe-area-inset-bottom)); display:grid; place-items:center; width:3rem; height:3rem; padding:0; border:1px solid var(--rule); border-radius:50%; background:var(--card); color:var(--fg); box-shadow:0 3px 14px rgb(0 0 0 / 18%); cursor:pointer; opacity:0; visibility:hidden; transform:translateY(.5rem); transition:opacity .2s,transform .2s,visibility .2s; }
    .back-to-menu.visible { opacity:1; visibility:visible; transform:translateY(0); }
    .back-to-menu:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
    .back-to-menu svg { width:1.35rem; height:1.35rem; }
  }
</style>
</head>
<body>
  <main>
  <span class="eyebrow">Daily Brief</span>
  <h1>Archive</h1>
  <p class="meta">${dates.length} report${dates.length === 1 ? "" : "s"} · newest first · generated ${new Date().toISOString().slice(0, 10)}</p>
  <div class="top">
    <a href="./index.html">→ Latest report (${latest})</a>
    <a href="./hola.html">→ Hola!</a>
  </div>
  <ul>
${rows}
  </ul>
  </main>
  <button class="back-to-menu" type="button" aria-label="Back to menu" title="Back to menu"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M5 14l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
  <script>
    const backToMenu = document.querySelector('.back-to-menu');
    const menu = document.querySelector('.top');
    function updateBackToMenu() { backToMenu.classList.toggle('visible', window.matchMedia('(max-width: 719px)').matches && window.scrollY > 400); }
    window.addEventListener('scroll', updateBackToMenu, { passive: true });
    window.addEventListener('resize', updateBackToMenu);
    backToMenu.addEventListener('click', () => menu.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
    updateBackToMenu();
  </script>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "archive.html"), archiveHtml, "utf8");
console.log(`[build-site] archive.html (${dates.length} dates)`);

// --- Hola! = standalone Spanish learning page ---
writeHolaPage(ROOT);
console.log(`[build-site] hola.html (dated lessons + saved Spanish A2 topic vocabularies)`);

// .nojekyll prevents GitHub Pages from running Jekyll, which would otherwise
// strip directories whose names start with "_". We don't have any today but
// it's cheap insurance and standard practice for static-site GH Pages.
fs.writeFileSync(path.join(ROOT, ".nojekyll"), "", "utf8");
console.log(`[build-site] .nojekyll`);
