import fs from "node:fs";

const SHOW_CHINESE_TRANSLATION = false;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

export function renderHolaPage(lesson) {
  const cards = (lesson?.items ?? []).map((item) => `
    <article class="word-card">
      <h2 lang="es">${escapeHtml(item.term)}</h2>
      <p class="pronunciation" lang="es">${escapeHtml(item.pronunciation || "")}</p>
      <details>
        <summary>Show meaning &amp; example</summary>
        <div class="answer">
          <p><strong>English:</strong> ${escapeHtml(item.translation.en)}</p>
          ${SHOW_CHINESE_TRANSLATION ? `<p><strong>中文：</strong> ${escapeHtml(item.translation.zh)}</p>` : ""}
          <blockquote lang="es">${escapeHtml(item.example.es)}</blockquote>
          <p>${escapeHtml(item.example.en)}</p>
          ${SHOW_CHINESE_TRANSLATION ? `<p lang="zh-CN">${escapeHtml(item.example.zh)}</p>` : ""}
        </div>
      </details>
    </article>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hola! — DailyBrief Learn</title>
<style>
  :root {
    --bg:#fafaf9; --bg-elevated:#fff; --fg:#18181b; --fg-soft:#3f3f46;
    --muted:#71717a; --rule:#e4e4e7; --card:#f4f4f5; --link:#1d4ed8;
    --accent:#18181b; --accent-fg:#fafaf9;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0a0a0a; --bg-elevated:#18181b; --fg:#fafafa; --fg-soft:#d4d4d8; --muted:#a1a1aa; --rule:#27272a; --card:#18181b; --link:#93c5fd; --accent:#fafafa; --accent-fg:#0a0a0a; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif; line-height:1.6; -webkit-font-smoothing:antialiased; }
  main { max-width:960px; margin:0 auto; padding:2.5rem 1.5rem 4rem; }
  h1 { font-size:2.2rem; font-weight:700; margin:0 0 1.2rem; letter-spacing:-.02em; line-height:1.1; }
  .lesson-meta { display:flex; flex-wrap:wrap; gap:.4rem; margin:0 0 1.5rem; }
  .keyword { background:var(--card); color:var(--fg-soft); padding:.25rem .7rem; border-radius:999px; font-size:.8rem; }
  .word-list { display:grid; grid-template-columns:1fr; gap:.5rem; }
  .word-card { background:var(--bg-elevated); border:1px solid var(--rule); border-radius:.5rem; padding:.7rem .95rem; }
  .word-card h2 { margin:0 0 .15rem; color:var(--fg); font-size:1rem; font-weight:500; line-height:1.45; }
  .pronunciation { color:var(--muted); font-size:.76rem; margin:0 0 .35rem; }
  details { border-top:1px solid var(--rule); padding-top:.45rem; }
  summary { color:var(--link); cursor:pointer; font-size:.85rem; }
  .answer { padding:.25rem 0 0; color:var(--fg-soft); font-size:.9rem; }
  .answer p { margin:.4rem 0; }
  blockquote { margin:.6rem 0 .35rem; padding:.55rem .8rem; background:var(--card); border-left:2px solid var(--link); border-radius:.3rem; color:var(--fg); }
  @media (min-width:720px) { .word-list { grid-template-columns:1fr 1fr; } }
  @media (max-width:600px) { main { padding:1.5rem 1rem 3rem; } h1 { font-size:2rem; margin-bottom:.8rem; } }
</style>
</head>
<body>
<main>
  <h1>Hola!</h1>
  ${lesson ? `<div class="lesson-meta" aria-label="Lesson tags"><span class="keyword">${escapeHtml(lesson.title)}</span><span class="keyword">A1</span><span class="keyword">${lesson.items.length} words</span></div>` : `<div class="lesson-meta" aria-label="Lesson status"><span class="keyword">A1</span></div><p>No lesson is available yet. A new lesson will appear after the next successful generation.</p>`}
  <section class="word-list" aria-label="Vocabulary">${cards}
  </section>
</main>
</body>
</html>`;
}

export function writeHolaPage(root = "daily_reports") {
  const generatedLessonsDir = `${root}/language/lessons`;
  const generatedLessonFiles = fs.existsSync(generatedLessonsDir)
    ? fs.readdirSync(generatedLessonsDir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort()
    : [];
  const lessonPath = generatedLessonFiles.length ? `${generatedLessonsDir}/${generatedLessonFiles.at(-1)}` : null;
  const lesson = lessonPath ? JSON.parse(fs.readFileSync(lessonPath, "utf8")) : null;
  fs.writeFileSync(`${root}/hola.html`, renderHolaPage(lesson), "utf8");
}
