// lib/feeds.js
export function makeSitemapXmlFromUrls({ hostname, urls }) {
  const items = (urls || []).map(u => `
  <url>
    <loc>${xml(u)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
}

export function makeRobotsTxt({ hostname }) {
  return `User-agent: *
Allow: /

Sitemap: https://${hostname}/sitemap.xml
`;
}

export function makeRssXml({ hostname, posts, siteName }) {
  const items = (posts || []).map(p => `
    <item>
      <title>${xml(p.title || '')}</title>
      <link>https://${hostname}${p.path || `/blog/${p.slug}/`}</link>
      <guid>https://${hostname}${p.path || `/blog/${p.slug}/`}</guid>
      ${p.published_at ? `<pubDate>${new Date(p.published_at).toUTCString()}</pubDate>` : ''}
      <description>${xml(p.meta_description || '')}</description>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${xml(siteName || hostname)}</title>
  <link>https://${hostname}/</link>
  <description>${xml(siteName || hostname)} feed</description>
  ${items}
</channel></rss>`;
}

function xml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
