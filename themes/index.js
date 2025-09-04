// themes/index.js
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = new Map(); // name -> wrapped theme

export async function loadTheme(themeConfig = {}) {
  const name = String(themeConfig?.name || 'classic').toLowerCase();
  if (CACHE.has(name)) return CACHE.get(name);

  const templatePath = path.join(__dirname, name, 'template.js');

  let raw;
  try {
    const mod = await import(pathToFileURL(templatePath).href);
    raw = extractThemeModule(mod, name); // -> { name, render, prepare? }
  } catch (e) {
    console.warn(`[themes] Failed to load "${name}" (${templatePath}):`, e?.message || e);
    raw = defaultClassic(); // safe fallback
  }

  const wrapped = withAssets(raw, raw.name || name);
  CACHE.set(wrapped.name, wrapped);
  return wrapped;
}

/** Accepts:
 *  - named exports: export function render(){}, export async function prepare(){}
 *  - default object: export default { render, prepare? }
 *  - default function: export default function render(){}
 */
function extractThemeModule(mod, name) {
  // 1) named
  if (typeof mod?.render === 'function') {
    return {
      name,
      render: mod.render,
      prepare: (typeof mod.prepare === 'function') ? mod.prepare : async () => ({ assetsHref: `/assets/${name}/` })
    };
  }
  // 2) default object
  const def = mod?.default;
  if (def && typeof def === 'object' && typeof def.render === 'function') {
    return {
      name: def.name || name,
      render: def.render,
      prepare: (typeof def.prepare === 'function') ? def.prepare : async () => ({ assetsHref: `/assets/${def.name || name}/` })
    };
  }
  // 3) default function (render only)
  if (typeof def === 'function') {
    return {
      name,
      render: def,
      prepare: async () => ({ assetsHref: `/assets/${name}/` })
    };
  }
  throw new Error(`Theme "${name}" must provide a render() function`);
}

/** Wrap so prepare() also copies ./assets -> /public/assets/<name>/ and guarantees assetsHref */
function withAssets(theme, name) {
  return {
    name: theme.name || name,
    render: theme.render,
    async prepare({ publicDir, themeConfig }) {
      const outBase = path.join(publicDir, 'assets', name);
      const srcBase = path.join(__dirname, name, 'assets');

      if (existsSync(srcBase)) await copyDir(srcBase, outBase);

      const inner = (typeof theme.prepare === 'function')
        ? (await theme.prepare({ publicDir, themeConfig })) || {}
        : {};

      const assetsHref = inner.assetsHref || `/assets/${name}/`;

      // ensure at least a style.css exists
      const cssPath = path.join(outBase, 'style.css');
      if (!existsSync(cssPath)) {
        await fs.mkdir(outBase, { recursive: true });
        await fs.writeFile(cssPath, defaultCss(name), 'utf8');
      }
      return { ...inner, assetsHref };
    }
  };
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

function defaultClassic() {
  return {
    name: 'classic',
    async prepare() { return { assetsHref: '/assets/classic/' }; },
    render({ hostname, site, meta, contentHtml, nav = [], assetsHref, locales = [], currentLocale='en', defaultLocale='en' }) {
      return `<!doctype html>
<html lang="${esc(currentLocale)}">
<head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(meta?.title || site?.name || hostname)}</title>
  ${meta?.description ? `<meta name="description" content="${esc(meta.description)}">` : ''}
  ${meta?.canonical ? `<link rel="canonical" href="${esc(meta.canonical)}">` : ''}
  <link rel="stylesheet" href="${assetsHref}style.css">
</head>
<body>
  <header class="site-header">
    <div class="brand"><a href="/"> ${esc(site?.name || hostname)} </a></div>
    <nav class="site-nav">${nav.map(i => `<a${i.active?' class="active"':''} href="${i.href}">${esc(i.label||'')}</a>`).join('')}</nav>
    <div class="lang">${(locales||[]).map(l=>`<a${l===currentLocale?' class="active"':''} href="${l===defaultLocale?'/':`/${l}/`}">${l.toUpperCase()}</a>`).join('')}</div>
  </header>
  <main class="content">${contentHtml}</main>
  <footer class="site-footer"><small>© ${new Date().getFullYear()}</small></footer>
</body>
</html>`;
    },
  };
}

function esc(s=''){ return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function defaultCss(name){
  return `:root{--primary:#2563eb;--text:#111;--muted:#6b7280}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--text)}
a{color:var(--primary);text-decoration:none}a:hover{text-decoration:underline}
header.site-header{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #eee}
.brand{font-weight:700}.site-nav a{margin:0 8px;padding:6px 10px;border-radius:8px}.site-nav a.active{background:#f3f4f6}
.lang a{margin:0 4px;padding:4px 8px;border:1px solid #eee;border-radius:6px}
main.content{max-width:960px;margin:32px auto;padding:0 16px}
footer.site-footer{padding:24px 20px;border-top:1px solid #eee;margin-top:40px;color:var(--muted)}/* theme=${name} */`;
}
