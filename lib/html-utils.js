// lib/html-utils.js
export function ensureHtml(html) {
  const s = String(html || '');
  return s.trim() ? s : '<h1>Untitled</h1><p>Content coming soon.</p>';
}

export function injectMeta(html, meta) {
  return html; // meta is consumed by theme.head, body stays as-is
}

export function extractImageUrls(html, mediaLinks = []) {
  const out = [];
  const srcRe = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = srcRe.exec(html))) {
    out.push(m[1]);
    if (out.length > 8) break;
  }
  for (const u of mediaLinks) if (typeof u === 'string') out.push(u);
  const seen = new Set();
  return out.filter(u => !seen.has(u) && seen.add(u));
}
