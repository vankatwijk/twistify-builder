// themes/classic/template.js
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

function esc(s=''){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function ensureSlashEnd(href=''){
  return href.endsWith('/') ? href : href + '/';
}
async function copyDir(src, dest) {
  if (!existsSync(src)) return;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

/** Build a compact CSS bundle if none is provided in assets */
async function ensureDefaultCss(outDir, themeName='classic') {
  await fs.mkdir(outDir, { recursive: true });
  const mainCss = path.join(outDir, `${themeName}.css`);
  if (!existsSync(mainCss)) {
    const css = `:root{
  --color-primary: #2563eb;
  --color-accent:  #a855f7;
  --font-body:     Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  --text:#111; --muted:#6b7280; --border:#e5e7eb; --bg:#fff; --bg-soft:#fafafa;
}
*{box-sizing:border-box}html,body{min-height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 var(--font-body)}
a{color:var(--color-primary);text-decoration:none}
a:hover{text-decoration:underline}
.container{max-width:1080px;margin:0 auto;padding:0 16px}
.header{border-bottom:1px solid var(--border);background:var(--bg-soft)}
.header__inner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0}
.brand{display:flex;align-items:center;font-weight:800;letter-spacing:.2px}
.brand .star{color:var(--color-accent);margin-right:8px}
.primary-nav ul{display:flex;gap:12px;list-style:none;margin:0;padding:0;flex-wrap:wrap}
.primary-nav a{display:block;padding:8px 10px;border-radius:8px}
.primary-nav a.active{background:color-mix(in srgb, var(--color-primary) 12%, transparent)}
.layout{display:grid;grid-template-columns:1fr 300px;gap:26px;padding:22px 0}
@media (max-width: 980px){.layout{grid-template-columns:1fr}}
.card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:22px;box-shadow:0 6px 20px rgba(0,0,0,.03)}
.card img{max-width:100%;height:auto;border-radius:10px;border:1px solid var(--border)}
.sidebar .widget{background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:18px}
.footer{border-top:1px solid var(--border);margin-top:24px;background:var(--bg-soft)}
.footer__inner{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 0;color:var(--muted)}
/* Floating language switcher style if theme wrapper not used */
.lm-lang-switcher{position:fixed;right:16px;bottom:16px;z-index:9999;background:rgba(12,12,14,.78);backdrop-filter:blur(8px);padding:6px;border-radius:9999px;border:1px solid rgba(255,255,255,.18)}
.lm-lang-switcher a{display:inline-block;margin:0 2px;padding:6px 10px;border-radius:9999px;color:#fff;text-decoration:none;font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;border:1px solid rgba(255,255,255,.25)}
.lm-lang-switcher a.active{background:#fff;color:#111}`;
    await fs.writeFile(mainCss, css, 'utf8');
  }
}

/** Builds a small CSS var file from themeConfig overrides */
async function writeVarsCss(outDir, themeConfig) {
  const vars = `:root{
  --color-primary: ${themeConfig?.primaryColor || '#2563eb'};
  --color-accent:  ${themeConfig?.accentColor  || '#a855f7'};
  --font-body:     ${themeConfig?.font || 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", sans-serif'};
}`;
  await fs.writeFile(path.join(outDir, 'vars.css'), vars, 'utf8');
}

/* ---------- THEME API ---------- */

export async function prepare({ publicDir, themeConfig }) {
  const themeRoot = path.resolve('themes', 'classic');
  const srcAssets = path.join(themeRoot, 'assets');          // optional: your own assets dir
  const outDir    = path.join(publicDir, 'assets', 'classic');

  // copy any provided assets
  if (existsSync(srcAssets)) await copyDir(srcAssets, outDir);

  // ensure default CSS exists (classic.css)
  await ensureDefaultCss(outDir, 'classic');

  // write vars.css from themeConfig overrides
  await writeVarsCss(outDir, themeConfig || {});

  // return how the builder should reference assets
  return { assetsHref: '/assets/classic/' };
}

export function render({
  hostname,
  site,
  pathHref,
  meta,
  contentHtml,
  nav = [],
  assetsHref = '/assets/classic/',
  themeConfig = {},
  locales = [],
  currentLocale = 'en',
  defaultLocale = 'en'
}) {
  const title = meta?.title || site?.name || hostname;
  const desc  = meta?.description || '';
  const canonical = meta?.canonical || `https://${hostname}${pathHref || '/'}`;
  const ogImage = meta?.ogImage || '';

  const brand = esc(themeConfig.logoText || site?.name || hostname);

  // language switcher (include data-lang-switcher to suppress builder fallback)
  const langSwitcher = (locales?.length > 1)
    ? `<div class="lang" data-lang-switcher>
      ${locales.map(l => {
        const isDef = (l === defaultLocale);
        const href  = isDef ? '/' : `/${l}/`;
        const cls   = l === currentLocale ? ' class="active"' : '';
        return `<a${cls} href="${href}">${l.toUpperCase()}</a>`;
      }).join('')}
    </div>`
    : '';

  // nav HTML
  const navHtml = `<nav class="primary-nav" aria-label="Primary">
    <ul>
      ${nav.map(i => `<li><a href="${ensureSlashEnd(i.href)}" class="${i.active ? 'active' : ''}">${esc(i.label || '')}</a></li>`).join('')}
    </ul>
  </nav>`;

  // “classic” WP-like two-column layout; right column shows a couple of simple widgets
  return `<!doctype html>
<html lang="${esc(currentLocale || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml">
<link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml">
<link rel="stylesheet" href="${ensureSlashEnd(assetsHref)}vars.css">
<link rel="stylesheet" href="${ensureSlashEnd(assetsHref)}classic.css">
</head>
<body>
<header class="header">
  <div class="container header__inner">
    <a class="brand" href="/"><span class="star">★</span> ${brand}</a>
    ${navHtml}
    ${langSwitcher}
  </div>
</header>

<div class="container layout">
  <main>
    <article class="card">
      ${contentHtml}
    </article>
  </main>

  <aside class="sidebar">
    ${site?.hasBlog ? `
    <div class="widget">
      <strong>Blog</strong>
      <div><a href="${currentLocale === defaultLocale ? '/blog/' : `/${currentLocale}/blog/`}">Latest Posts</a></div>
      <div><a href="/rss.xml">RSS Feed</a></div>
    </div>` : ''}

    <div class="widget">
      <strong>Navigation</strong>
      <ul style="list-style:none;margin:8px 0 0;padding:0">
        ${nav.map(i => `<li style="margin:4px 0"><a href="${ensureSlashEnd(i.href)}">${esc(i.label || '')}</a></li>`).join('')}
      </ul>
    </div>
  </aside>
</div>

<footer class="footer">
  <div class="container footer__inner">
    <small>© ${new Date().getFullYear()} ${esc(site?.name || hostname)}</small>
    <small>Powered by Twistify</small>
  </div>
</footer>
</body>
</html>`;
}

/* Also provide a default export object (max compatibility) */
export default { name: 'classic', prepare, render };
