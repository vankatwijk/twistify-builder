// themes/minimal/template.js
import { promises as fs } from 'fs';
import path from 'path';

export default {
  name: 'minimal',
  async prepare({ publicDir, themeConfig }) {
    // Minimal theme has no assets; still return a stub path
    return { assetsHref: '/assets/theme' };
  },
  render({ hostname, site, pathHref, meta, contentHtml, nav }) {
    const title = meta?.title || site?.name || hostname;
    const desc  = meta?.description || '';
    const canonical = meta?.canonical || `https://${hostname}${pathHref||'/'}`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<style>
  body{font:16px/1.6 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, sans-serif; margin:2rem; color:#111;}
  nav a{margin-right:12px}
  a{color:#2563eb;text-decoration:none}
</style>
</head>
<body>
<nav>${nav.map(i=>`<a href="${i.href}" ${i.active?'style="font-weight:700"':''}>${i.label}</a>`).join('')}</nav>
<main>${contentHtml}</main>
</body>
</html>`;
  }
};
