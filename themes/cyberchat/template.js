import path from 'path';
import fs from 'fs/promises';

// Optionally copy static assets later; for now we just create a folder
export async function prepare({ publicDir /*, themeConfig */ }) {
  const assetsDir = path.join(publicDir, 'assets', 'cyberchat');
  await fs.mkdir(assetsDir, { recursive: true });
  // If you add fonts/images, copy them here and reference with assetsHref
  return { assetsHref: '/assets/cyberchat/' };
}

export function render({ hostname, site, pathHref, meta, contentHtml, nav, assetsHref, themeConfig = {} }) {
  const colors = {
    bg:          themeConfig.bg          || '#0b0f16',
    sidebar:     themeConfig.sidebar     || '#0e1420',
    surface:     themeConfig.surface     || '#111827',
    fg:          themeConfig.fg          || '#e5e7eb',
    muted:       themeConfig.muted       || '#94a3b8',
    primary:     themeConfig.primaryColor|| '#00e5ff',
    accent:      themeConfig.accentColor || '#ff4ecd',
    border:      '#1f2937',
  };
  const font = themeConfig.font || 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, sans-serif';

  const navHtml = `
    <nav class="nav">
      <div class="brand">
        <span class="pulse-dot"></span>
        <a href="/" aria-label="${escapeHtml(site?.name || hostname)}">${escapeHtml(site?.name || hostname)}</a>
      </div>
      <ul>
        ${nav.map(item => `
          <li><a href="${item.href}" class="${item.active ? 'active':''}">${escapeHtml(item.label)}</a></li>
        `).join('')}
      </ul>
    </nav>
  `;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(meta.title || site?.name || hostname)}</title>
<meta name="description" content="${escapeHtml(meta.description || '')}">
<link rel="canonical" href="${escapeHtml(meta.canonical || `https://${hostname}/`)}">
<meta property="og:title" content="${escapeHtml(meta.title || '')}">
<meta property="og:description" content="${escapeHtml(meta.description || '')}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(meta.canonical || `https://${hostname}/`)}">
${meta.ogImage ? `<meta property="og:image" content="${escapeHtml(meta.ogImage)}">` : ''}

<link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml">
<link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml">

<style>
  :root{
    --bg:${colors.bg};
    --sidebar:${colors.sidebar};
    --surface:${colors.surface};
    --fg:${colors.fg};
    --muted:${colors.muted};
    --primary:${colors.primary};
    --accent:${colors.accent};
    --border:${colors.border};
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0; padding:0; background:var(--bg); color:var(--fg);
    font:${'16px/1.65'} ${font};
    display:grid; grid-template-columns:280px 1fr; min-height:100vh;
  }
  /* Sidebar */
  aside{
    background:linear-gradient(180deg, var(--sidebar), rgba(14,20,32,0.9));
    border-right:1px solid var(--border);
    position:relative;
  }
  /* Subtle neon border glow */
  aside::after{
    content:""; position:absolute; right:-1px; top:0; bottom:0; width:1px;
    box-shadow: 0 0 16px var(--accent), 0 0 32px var(--primary);
    opacity:.25; pointer-events:none;
  }
  .nav{padding:18px}
  .brand{
    display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.3px;
    text-transform:none; font-size:14px; color:var(--fg);
  }
  .brand a{color:var(--fg); text-decoration:none}
  .pulse-dot{
    width:8px;height:8px;border-radius:999px; background:var(--primary); display:inline-block;
    box-shadow:0 0 12px var(--primary), 0 0 28px var(--accent);
    animation:pulse 2.6s ease-in-out infinite;
  }
  @keyframes pulse{0%,100%{transform:scale(.9);opacity:.8}50%{transform:scale(1.15);opacity:1}}

  .nav ul{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
  .nav a{
    display:block; padding:8px 10px; border-radius:8px; color:var(--muted); text-decoration:none; font-weight:500;
    border:1px solid transparent;
  }
  .nav a:hover{border-color:rgba(255,255,255,.08); color:var(--fg); background:rgba(255,255,255,.02)}
  .nav a.active{
    color:#111827; background:linear-gradient(90deg, var(--primary), var(--accent));
    border-color:transparent; text-shadow:0 0 12px rgba(255,255,255,.15);
  }

  /* Main */
  main{padding:28px 32px}
  header.top{
    display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;
  }
  .crumb{color:var(--muted); font-size:13px}
  .crumb a{color:var(--muted); text-decoration:none}
  .crumb a:hover{color:var(--fg)}

  .card{
    background:radial-gradient(1200px 900px at 100% -10%, rgba(0,229,255,.06), transparent 45%),
               radial-gradient(900px 700px  at -20% 120%, rgba(255,78,205,.05), transparent 40%),
               var(--surface);
    border:1px solid var(--border);
    border-radius:14px;
    box-shadow:0 10px 30px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.03);
    padding:24px;
  }
  .card h1,.card h2,.card h3{margin-top:0}
  h1{font-size:28px; letter-spacing:.2px}
  h2{font-size:22px}
  h3{font-size:18px}
  p{margin:12px 0}
  img{max-width:100%; height:auto; border-radius:10px; border:1px solid var(--border)}
  a{color:var(--primary)}
  a:hover{color:var(--accent)}

  footer{
    grid-column:1 / -1; padding:20px 32px; color:var(--muted); border-top:1px solid var(--border);
    background:linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.25));
  }

  /* Responsive: collapse sidebar on small screens */
  @media (max-width: 960px){
    body{grid-template-columns:1fr}
    aside{display:none}
    main{padding:18px}
  }
</style>
</head>
<body>
  <aside>
    ${navHtml}
  </aside>

  <main>
    <header class="top">
      <div class="crumb">
        <a href="/">Home</a>
        <span> / </span>
        <span>${escapeHtml(pathHref === '/' ? 'Home' : (meta.title || ''))}</span>
      </div>
    </header>

    <section class="card">
      ${contentHtml}
    </section>
  </main>

  <footer>
    <small>&copy; ${new Date().getFullYear()} ${escapeHtml(site?.name || hostname)} • Served by Twistify Builder</small>
  </footer>
</body>
</html>`;
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
