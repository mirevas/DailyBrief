import fs from "node:fs";
import path from "node:path";

const SHOW_CHINESE_TRANSLATION = false;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

function renderWord(item, id) {
  return `<article class="word-card" id="${escapeHtml(id)}">
    <h3 lang="es">${escapeHtml(item.term)}</h3>
    <p class="lemma">${escapeHtml(item.partOfSpeech)} · ${escapeHtml(item.lemma)}${item.pronunciation ? ` · ${escapeHtml(item.pronunciation)}` : ""}</p>
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
  </article>`;
}

function renderMenuGroup({ title, subtitle, items }) {
  if (!items.length) return "";
  const list = items.map(({ item, id }) => `<li><a href="#${escapeHtml(id)}">${escapeHtml(item.term)}</a></li>`).join("");
  return `<details class="menu-group"><summary>${escapeHtml(title)}${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}</summary><ul>${list}</ul></details>`;
}

function renderContentGroup(group) {
  return `<section class="content-group" id="${escapeHtml(group.key)}" data-group-key="${escapeHtml(group.key)}">
    <h2>${escapeHtml(group.title)} <small>${escapeHtml(group.subtitle)}</small></h2>
    <div class="word-list">${group.items.map(({ item, id }) => renderWord(item, id)).join("\n")}</div>
  </section>`;
}

function renderMobileTabs(groups, view, selectedKey) {
  if (groups.length === 0) return "";
  const tabs = groups.map((group) => {
    const label = view === "dates" ? group.title.slice(2).replace(/-/g, "/") : group.title;
    const selected = group.key === selectedKey;
    return `<button type="button" class="subtab" data-mobile-group="${escapeHtml(group.key)}" aria-selected="${selected}">${escapeHtml(label)}</button>`;
  }).join("");
  return `<nav class="mobile-subnav" data-subnav-view="${view}" aria-label="${view === "dates" ? "Report dates" : "Topics"}" hidden>${tabs}</nav>`;
}

export function renderHolaPage(lessons, lexicons = []) {
  const dateGroups = [...lessons].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((lesson) => ({
    key: `date-${lesson.createdAt}`,
    title: lesson.createdAt,
    subtitle: `${lesson.title} · ${lesson.level ?? "A2"} · ${lesson.items.length} words`,
    items: lesson.items.map((item) => ({ item, id: `date-${lesson.createdAt}-${item.entryId}` })),
  }));
  const topicGroups = [...lexicons].sort((a, b) => a.title.localeCompare(b.title)).map((lexicon) => ({
    key: `topic-${lexicon.topicId}`,
    title: lexicon.title,
    subtitle: `${lexicon.level} · ${lexicon.items.length} words`,
    items: lexicon.items.map((item) => ({ item, id: `topic-${lexicon.topicId}-${item.entryId}` })),
  }));
  const newestDate = dateGroups[0]?.key;
  const firstTopic = topicGroups[0]?.key;
  const datesMenu = dateGroups.map(({ title, subtitle, items }) => renderMenuGroup({ title, subtitle, items })).join("\n");
  const topicsMenu = topicGroups.map(({ title, subtitle, items }) => renderMenuGroup({ title, subtitle, items })).join("\n");
  const datesContent = dateGroups.map(renderContentGroup).join("\n");
  const topicsContent = topicGroups.map(renderContentGroup).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hola! — DailyBrief Learn</title>
<style>
  :root { color-scheme:light; --bg:#fafaf9; --bg-elevated:#fff; --panel:#fff; --fg:#18181b; --soft:#3f3f46; --muted:#71717a; --rule:#e4e4e7; --card:#f4f4f5; --link:#1d4ed8; --accent:#18181b; --accent-fg:#fafaf9; }
  @media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0a0a0a;--bg-elevated:#18181b;--panel:#18181b;--fg:#fafafa;--soft:#d4d4d8;--muted:#a1a1aa;--rule:#27272a;--card:#18181b;--link:#93c5fd;--accent:#fafafa;--accent-fg:#0a0a0a}}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  main{max-width:960px;margin:0 auto;padding:2.5rem 1.5rem 4rem}header.report-header{margin-bottom:1.25rem;padding:0;border:0;background:none}.eyebrow{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.2em;color:var(--muted);font-weight:500}h1.report-title{font-size:2.2rem;font-weight:700;margin:.4rem 0 .75rem;letter-spacing:-.02em;line-height:1.1}
  .header-links{display:flex;flex-direction:column;align-items:flex-start;gap:.1rem}.archive-link{display:inline-block;color:var(--muted);font-size:.85rem;text-decoration:none;border-bottom:1px dashed var(--rule);padding-bottom:1px}.archive-link:hover{color:var(--accent);border-bottom-style:solid}
  .primary{margin:1.25rem 0 .75rem;padding:0;display:flex;gap:.25rem;border-bottom:1px solid var(--rule);flex-wrap:wrap}.primary button{background:none;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;color:var(--muted);padding:.7rem 1.1rem;cursor:pointer;font-family:inherit;font-size:.95rem;font-weight:500;white-space:nowrap}.primary button:hover{color:var(--fg)}.primary button[aria-selected="true"]{color:var(--fg);border-bottom-color:var(--accent)}
  .mobile-subnav{display:none}
  .layout{margin:0;padding:0;display:grid;grid-template-columns:250px minmax(0,1fr);gap:1.2rem;align-items:start}.sidebar{position:sticky;top:1rem;max-height:calc(100vh - 2rem);overflow:auto;background:var(--bg-elevated);border:1px solid var(--rule);border-radius:.6rem;padding:.8rem}.menu-group{border-bottom:1px solid var(--rule);padding:.55rem 0}.menu-group:last-child{border:0}.menu-group>summary{cursor:pointer;font-weight:650}.menu-group>summary span{display:block;color:var(--muted);font-size:.76rem;font-weight:400}.menu-group ul{list-style:none;margin:.35rem 0 0;padding:0 0 0 .55rem}.menu-group li a{display:block;padding:.22rem .35rem;color:var(--link);font-size:.84rem;text-decoration:none;border-radius:.3rem}.menu-group li a:hover{background:var(--card)}
  .content{min-width:0}.content-group{margin:0 0 2rem;scroll-margin-top:1rem}.content-group h2{font-size:1.25rem;margin:.1rem 0 .8rem}.content-group small{font-size:.82rem;font-weight:400;color:var(--muted)}.word-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:.6rem}.word-card{background:var(--panel);border:1px solid var(--rule);border-radius:.55rem;padding:.75rem .9rem;scroll-margin-top:1rem}.word-card h3{margin:0;font-size:1rem;font-weight:600}.lemma{margin:.1rem 0 .4rem;font-size:.77rem;color:var(--muted)}details:not(.menu-group)>summary{border-top:1px solid var(--rule);padding-top:.4rem;color:var(--link);cursor:pointer;font-size:.84rem}.answer{padding:.25rem 0 0;color:var(--soft);font-size:.88rem}.answer p{margin:.4rem 0}blockquote{margin:.55rem 0 .3rem;padding:.5rem .7rem;background:var(--card);border-left:2px solid var(--link);border-radius:.25rem;color:var(--fg)}
  [hidden]{display:none!important}.back-to-menu{display:none}
  @media(max-width:719px){
    main{padding:1.35rem 1rem 3rem}header.report-header{margin-bottom:.7rem}h1.report-title{font-size:2rem;margin:.3rem 0 .75rem}.header-links{margin-top:.5rem}
    .primary,.mobile-subnav{margin:.2rem 0 0;padding:0;display:flex;gap:.15rem;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior-x:contain;border-bottom:1px solid var(--rule)}
    .primary::-webkit-scrollbar,.mobile-subnav::-webkit-scrollbar{display:none}.primary button,.mobile-subnav button{flex:0 0 auto;border:0;border-bottom:2px solid transparent;border-radius:0;background:none;color:var(--muted);padding:.7rem .85rem;margin-bottom:-1px;font:500 .92rem -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.primary button[aria-selected="true"],.mobile-subnav button[aria-selected="true"]{background:none;color:var(--fg);border-bottom-color:var(--fg)}
    .layout{grid-template-columns:1fr;padding:0 1rem 3rem}.sidebar{display:none}.content-group{display:none}.mobile-vocab .content-group.mobile-selected{display:block;margin-top:1rem}.word-list{grid-template-columns:1fr}
    .back-to-menu{position:fixed;z-index:10;right:max(1.25rem,env(safe-area-inset-right));bottom:max(1.25rem,env(safe-area-inset-bottom));display:grid;place-items:center;width:3rem;height:3rem;padding:0;border:1px solid var(--rule);border-radius:50%;background:var(--card);color:var(--fg);box-shadow:0 3px 14px rgb(0 0 0 / 18%);cursor:pointer;opacity:0;visibility:hidden;transform:translateY(.5rem);transition:opacity .2s,transform .2s,visibility .2s}.back-to-menu.visible{opacity:1;visibility:visible;transform:translateY(0)}.back-to-menu:focus-visible{outline:2px solid var(--link);outline-offset:3px}.back-to-menu svg{width:1.35rem;height:1.35rem}
  }
</style>
</head>
<body>
<main>
<header class="report-header"><span class="eyebrow">DailyBrief Learn</span><h1 class="report-title">Hola! <small style="font-size:.8rem;color:var(--muted);font-weight:400">Spanish A2 vocabulary</small></h1><div class="header-links"><a class="archive-link" href="./index.html">→ Latest report</a></div></header>
<nav class="primary" aria-label="Vocabulary views"><button type="button" data-view="dates" aria-selected="true">Dates</button><button type="button" data-view="topics" aria-selected="false">Topics</button></nav>
${renderMobileTabs(dateGroups, "dates", newestDate)}
${renderMobileTabs(topicGroups, "topics", firstTopic)}
<div class="layout">
  <aside class="sidebar" aria-label="Vocabulary menu">
    <div data-menu-view="dates">${datesMenu || "<p>No dated vocabulary yet.</p>"}</div>
    <div data-menu-view="topics" hidden>${topicsMenu || "<p>No saved topic vocabulary yet.</p>"}</div>
  </aside>
  <section class="content">
    <div data-content-view="dates">${datesContent || "<p>No lesson is available yet. A new lesson will appear after the next successful generation.</p>"}</div>
    <div data-content-view="topics" hidden>${topicsContent || "<p>No topic vocabulary has been generated yet.</p>"}</div>
  </section>
</div>
<button class="back-to-menu" type="button" aria-label="Back to top menu" title="Back to top menu"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M5 14l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
</main>
<script>
  const tabs = [...document.querySelectorAll('[data-view]')];
  const backToMenu = document.querySelector('.back-to-menu');
  const primaryMenu = document.querySelector('.primary');
  const isMobile = () => window.matchMedia('(max-width: 719px)').matches;
  const defaults = { dates: '${escapeHtml(newestDate ?? "")}', topics: '${escapeHtml(firstTopic ?? "")}' };
  let activeView = 'dates';
  let activeGroup = defaults.dates;
  function selectMobileGroup(view, key) {
    activeView = view;
    activeGroup = key || defaults[view];
    const contentView = document.querySelector('[data-content-view="' + view + '"]');
    for (const group of contentView?.querySelectorAll('.content-group') ?? []) {
      group.classList.toggle('mobile-selected', group.dataset.groupKey === activeGroup);
    }
    for (const nav of document.querySelectorAll('[data-subnav-view="' + view + '"]')) {
      for (const button of nav.querySelectorAll('[data-mobile-group]')) {
        button.setAttribute('aria-selected', String(button.dataset.mobileGroup === activeGroup));
      }
    }
    document.body.classList.toggle('mobile-vocab', isMobile());
  }
  function selectView(view) {
    activeView = view;
    for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.view === view));
    for (const panel of document.querySelectorAll('[data-menu-view], [data-content-view], [data-subnav-view]')) {
      panel.hidden = (panel.dataset.menuView || panel.dataset.contentView || panel.dataset.subnavView) !== view;
    }
    if (isMobile()) selectMobileGroup(view, defaults[view]);
    else document.body.classList.remove('mobile-vocab');
  }
  for (const tab of tabs) tab.addEventListener('click', () => selectView(tab.dataset.view));
  for (const button of document.querySelectorAll('[data-mobile-group]')) {
    button.addEventListener('click', () => selectMobileGroup(button.closest('[data-subnav-view]').dataset.subnavView, button.dataset.mobileGroup));
  }
  function updateBackToMenu() {
    backToMenu.classList.toggle('visible', isMobile() && window.scrollY > 400);
  }
  window.addEventListener('scroll', updateBackToMenu, { passive: true });
  window.addEventListener('resize', updateBackToMenu);
  backToMenu.addEventListener('click', () => {
    primaryMenu.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  window.matchMedia('(max-width: 719px)').addEventListener('change', (event) => {
    if (event.matches) selectMobileGroup(activeView, activeGroup);
    else document.body.classList.remove('mobile-vocab');
    updateBackToMenu();
  });
  selectView('dates');
  updateBackToMenu();
</script>
</body>
</html>`;
}

export function writeHolaPage(root = "daily_reports") {
  const lessonsDir = path.join(root, "language", "lessons");
  const lessonFiles = fs.existsSync(lessonsDir)
    ? fs.readdirSync(lessonsDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()
    : [];
  const lessons = lessonFiles.map((name) => JSON.parse(fs.readFileSync(path.join(lessonsDir, name), "utf8")));
  const lexiconsDir = path.join(root, "language", "topics");
  const lexiconFiles = fs.existsSync(lexiconsDir)
    ? fs.readdirSync(lexiconsDir).filter((name) => name.endsWith(".json")).sort()
    : [];
  const lexicons = lexiconFiles.map((name) => JSON.parse(fs.readFileSync(path.join(lexiconsDir, name), "utf8")));
  fs.writeFileSync(path.join(root, "hola.html"), renderHolaPage(lessons, lexicons), "utf8");
}
