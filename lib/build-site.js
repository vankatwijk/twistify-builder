import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import pLimit from 'p-limit';
import sanitize from 'sanitize-filename';
import { loadTheme } from '../themes/index.js';
import { ensureHtml, injectMeta, extractImageUrls } from './html-utils.js';
import { makeSitemapXmlFromUrls, makeRobotsTxt, makeRssXml } from './feeds.js';

const limit = pLimit(Number(process.env.MAX_CONCURRENCY || 6));

export async function removeSiteCompletely(sitesRoot, hostname) {
  const base = path.join(sitesRoot, hostname);
  if (existsSync(base)) await fs.rm(base, { recursive: true, force: true });
}

export async function buildSite({ sitesRoot, hostname, blueprint, pages, posts, locales }) {
  const base = path.join(sitesRoot, hostname);
  const pub  = path.join(base, 'public');
  const img  = path.join(pub, 'img');

  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(img, { recursive: true });

  const allLocales = (Array.isArray(locales) && locales.length ? locales : ['en'])
    .map(x => String(x).toLowerCase());
  const defaultLoc = String(blueprint?.default_locale || allLocales[0] || 'en').toLowerCase();

  const normPages = (pages || []).map(normalizeDoc);
  const normPosts = (posts || []).map(normalizeDoc);

  // THEME
  const themeConfig = blueprint?.theme || {};
  const theme = await loadTheme(themeConfig);
  const safePrepare = (typeof theme.prepare === 'function')
    ? theme.prepare
    : async () => ({ assetsHref: `/assets/${theme.name || themeConfig.name || 'classic'}/` });
  const { assetsHref } = await safePrepare({ publicDir: pub, themeConfig });

  const site = { name: blueprint?.site_name || hostname, hasBlog: normPosts.length > 0 };

  const baseNav = makeNav({
    hostname,
    pages: normPages.filter(isDefaultDoc(defaultLoc)),
    posts: normPosts.filter(isDefaultDoc(defaultLoc)),
    themeConfig
  });

  const sitemapUrls = [];

  // default locale (root)
  await buildLocaleTree({
    locale: defaultLoc, isDefault: true, pubBase: pub,
    hostname, site, pages: normPages, posts: normPosts,
    theme, assetsHref, baseNav, allLocales, defaultLoc, sitemapUrls, themeConfig
  });

  // other locales (/xx)
  for (const loc of allLocales) {
    if (loc === defaultLoc) continue;
    const locDir = path.join(pub, loc);
    await fs.mkdir(locDir, { recursive: true });
    await buildLocaleTree({
      locale: loc, isDefault: false, pubBase: locDir,
      hostname, site, pages: normPages, posts: normPosts,
      theme, assetsHref, baseNav, allLocales, defaultLoc, sitemapUrls, themeConfig
    });
  }

  await fs.writeFile(path.join(pub, 'sitemap.xml'), makeSitemapXmlFromUrls({ hostname, urls: sitemapUrls }), 'utf8');
  await fs.writeFile(path.join(pub, 'robots.txt'), makeRobotsTxt({ hostname }), 'utf8');

  // rss
  const defaultPosts = normPosts.filter(d => (d.locale || defaultLoc) === defaultLoc);
  if (defaultPosts.length) {
    await fs.writeFile(path.join(pub, 'rss.xml'),
      makeRssXml({ hostname, posts: defaultPosts.map(p => ({ ...p, path: canonicalPostPath(p, defaultLoc, defaultLoc) })), siteName: site.name }),
      'utf8'
    );
  }
  for (const loc of allLocales) {
    if (loc === defaultLoc) continue;
    const postsLoc = normPosts.filter(d => (d.locale || defaultLoc) === loc);
    if (!postsLoc.length) continue;
    await fs.writeFile(path.join(pub, `rss.${loc}.xml`),
      makeRssXml({ hostname, posts: postsLoc.map(p => ({ ...p, path: canonicalPostPath(p, loc, defaultLoc) })), siteName: `${site.name} (${loc.toUpperCase()})` }),
      'utf8'
    );
  }

  await fs.writeFile(path.join(base, 'manifest.json'), JSON.stringify({
    hostname,
    site_name: site.name,
    locales: allLocales,
    default_locale: defaultLoc,
    pages: normPages.map(p => ({ title: p.title, slug: p.slug, locale: p.locale || defaultLoc })),
    posts: normPosts.map(p => ({ title: p.title, slug: p.slug, locale: p.locale || defaultLoc })),
    built_at: new Date().toISOString(),
    theme: { name: theme.name, config: themeConfig }
  }, null, 2), 'utf8');

  return { hostname, pages: normPages.length, posts: normPosts.length, theme: theme.name, locales: allLocales, default_locale: defaultLoc };
}

/* per-locale build */

async function buildLocaleTree(ctx) {
  const {
    locale, isDefault, pubBase, hostname, site,
    pages, posts, theme, assetsHref, baseNav, allLocales, defaultLoc, sitemapUrls, themeConfig
  } = ctx;

  const pageIndex = indexBySlugLocale(pages);
  const postIndex = indexBySlugLocale(posts);
  const navLocalized = localizeNav(baseNav, locale, defaultLoc);

  // home
  const homeDoc = pickDoc(pageIndex, 'home', locale, defaultLoc) || firstDocForLocale(pageIndex, locale, defaultLoc);
  if (homeDoc) {
    const publicHref = isDefault ? '/' : `/${locale}/`;
    const fsPath     = '/';
    await writeThemedRoute({
      pub: pubBase, hostname, site, doc: homeDoc, theme, assetsHref, nav: markActive(navLocalized, publicHref),
      publicHref, fsPath, allLocales, currentLocale: locale, defaultLoc, themeConfig
    });
    sitemapUrls.push(`https://${hostname}${publicHref}`);
  }

  // pages
  for (const slug of Object.keys(pageIndex)) {
    const d = pickDoc(pageIndex, slug, locale, defaultLoc);
    if (!d) continue;
    const fsPath     = (slug === 'home' || slug === 'index') ? '/' : `/${slug}/`;
    const publicHref = isDefault ? fsPath : `/${locale}${fsPath}`;
    await writeThemedRoute({
      pub: pubBase, hostname, site, doc: d, theme, assetsHref, nav: markActive(navLocalized, publicHref),
      publicHref, fsPath, allLocales, currentLocale: locale, defaultLoc, themeConfig
    });
    sitemapUrls.push(`https://${hostname}${publicHref}`);
  }

  // posts
  for (const slug of Object.keys(postIndex)) {
    const d = pickDoc(postIndex, slug, locale, defaultLoc);
    if (!d) continue;
    const fsPath     = `/blog/${slug}/`;
    const publicHref = isDefault ? fsPath : `/${locale}${fsPath}`;
    await writeThemedRoute({
      pub: pubBase, hostname, site, doc: d, theme, assetsHref, nav: markActive(navLocalized, publicHref),
      publicHref, fsPath, allLocales, currentLocale: locale, defaultLoc, themeConfig
    });
    sitemapUrls.push(`https://${hostname}${publicHref}`);
  }
}

/* helpers */

function isDefaultDoc(defaultLoc){ return (d) => (d.locale || defaultLoc) === defaultLoc; }

function normalizeDoc(d) {
  return {
    title: String(d.title || 'Untitled'),
    slug: sanitizeSlug(String(d.slug || 'page')),
    html: ensureHtml(String(d.html || '')),
    meta_title: (d.meta_title || '').toString().slice(0, 60),
    meta_description: (d.meta_description || '').toString().slice(0, 160),
    author: d.author || null,
    category: d.category || null,
    published_at: d.published_at || null,
    media_links: Array.isArray(d.media_links) ? d.media_links : (d.media_link ? [d.media_link] : []),
    locale: d.locale ? String(d.locale).toLowerCase() : null,
  };
}

function sanitizeSlug(s) {
  const t = s.replace(/^\/+|\/+$/g,'').trim();
  const safe = sanitize(t).toLowerCase().replace(/\s+/g,'-').replace(/-+/g,'-');
  return safe || 'page';
}

function indexBySlugLocale(items){
  const idx = {};
  for (const it of items) {
    const slug = String(it.slug || '').replace(/^\/|\/$/g, '') || 'home';
    const loc  = String(it.locale || '').toLowerCase();
    idx[slug] ??= {};
    idx[slug][loc || '__default__'] = it;
  }
  return idx;
}
function pickDoc(index, slug, loc, fallbackLoc){
  const byLoc = index[slug];
  if (!byLoc) return null;
  return byLoc[loc] || byLoc['__default__'] || byLoc[fallbackLoc] || Object.values(byLoc)[0] || null;
}
function firstDocForLocale(index, loc, fallbackLoc){
  for (const slug of Object.keys(index)) {
    const d = pickDoc(index, slug, loc, fallbackLoc);
    if (d) return d;
  }
  return null;
}

function canonicalPostPath(doc, loc, defaultLoc){
  return loc === defaultLoc ? `/blog/${doc.slug}/` : `/${loc}/blog/${doc.slug}/`;
}

function localizeHref(href, locale, defaultLoc){
  if (!href || href === '/') return (locale === defaultLoc) ? '/' : `/${locale}/`;
  if (href.startsWith('/blog')) return (locale === defaultLoc) ? ensureSlash(href) : `/${locale}${ensureSlash(href)}`;
  return (locale === defaultLoc) ? ensureSlash(href) : `/${locale}${ensureSlash(href)}`;
}
function ensureSlash(h){ return h.endsWith('/') ? h : `${h}/`; }

function localizeNav(nav, locale, defaultLoc) {
  return nav.map(item => ({ ...item, href: localizeHref(item.href, locale, defaultLoc) }));
}
function markActive(nav, publicHref){ return nav.map(n => ({ ...n, active: n.href === publicHref })); }

/* -------- THEME-AGNOSTIC LANGUAGE SWITCHER -------- */

function stripLeadingLocale(publicHref, allLocales) {
  for (const l of allLocales) {
    const p = `/${l}/`;
    if (publicHref === `/${l}` || publicHref.startsWith(p)) {
      return publicHref.slice(p.length - 1) || '/'; // keep leading slash
    }
  }
  return publicHref || '/';
}

function hrefForLocale(publicHref, targetLocale, defaultLocale, allLocales) {
  const stripped = stripLeadingLocale(publicHref, allLocales); // e.g. '/about/' or '/'
  if (targetLocale === defaultLocale) return stripped;
  // ensure single leading slash
  return `/${targetLocale}${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
}

function buildLangSwitcher({ publicHref, locales, currentLocale, defaultLocale, max = 6 }) {
  if (!Array.isArray(locales) || locales.length <= 1) return '';
  const links = locales.slice(0, max).map(l => {
    const href = hrefForLocale(publicHref, l, defaultLocale, locales);
    const active = l === currentLocale ? ' class="active"' : '';
    return `<a${active} href="${href}">${l.toUpperCase()}</a>`;
  }).join('');
  return `
<style>
  .lm-lang-switcher{position:fixed;right:16px;bottom:16px;z-index:9999;background:rgba(20,20,22,.75);backdrop-filter:blur(8px);padding:6px;border-radius:9999px;border:1px solid rgba(255,255,255,.15)}
  .lm-lang-switcher a{display:inline-block;margin:0 2px;padding:6px 10px;border-radius:9999px;color:#fff;text-decoration:none;font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;border:1px solid rgba(255,255,255,.25)}
  .lm-lang-switcher a.active{background:#fff;color:#111}
  @media (max-width:480px){.lm-lang-switcher{right:10px;bottom:10px}}
</style>
<div class="lm-lang-switcher" data-lang-switcher>
  ${links}
</div>`;
}

function injectBeforeCloseBody(html, snippet){
  if (!snippet) return html;
  const i = html.toLowerCase().lastIndexOf('</body>');
  return (i !== -1) ? (html.slice(0, i) + snippet + html.slice(i)) : (html + snippet);
}

async function writeThemedRoute({
  pub, hostname, site, doc, theme, assetsHref, nav,
  publicHref, fsPath, allLocales, currentLocale, defaultLoc, themeConfig
}) {
  const dir  = path.join(pub, fsPath === '/' ? '' : fsPath.replace(/^\//,''));
  const dest = path.join(dir, 'index.html');
  await fs.mkdir(dir, { recursive: true });

  const images = extractImageUrls(doc.html, doc.media_links);
  const meta = {
    title: doc.meta_title || doc.title,
    description: doc.meta_description || '',
    canonical: `https://${hostname}${publicHref}`,
    ogImage: images[0] || null
  };

  const content = injectMeta(doc.html, meta);

  let html = theme.render({
    hostname, site, pathHref: publicHref, meta,
    contentHtml: content, nav, assetsHref,
    themeConfig, locales: allLocales, currentLocale, defaultLocale: defaultLoc
  });

  // If theme didn't include any language switcher, inject a floating one
  if (!/\b(lm-lang-switcher|data-lang-switcher)\b/i.test(html)) {
    const switcher = buildLangSwitcher({
      publicHref, locales: allLocales, currentLocale, defaultLocale: defaultLoc
    });
    html = injectBeforeCloseBody(html, switcher);
  }

  await fs.writeFile(dest, html, 'utf8');
}

/* nav generation */

function makeNav({ hostname, pages, posts, themeConfig }) {
  const cfg = themeConfig?.nav || {};
  if (Array.isArray(cfg.items) && cfg.items.length) {
    const provided = cfg.items
      .filter(i => i && typeof i === 'object')
      .map(i => ({ href: normalizeHref(i.slug), label: i.title || prettyLabel(i.slug) }));
    if (cfg.includeBlog && posts.length && !provided.some(i => i.href === '/blog/')) {
      provided.push({ href: '/blog/', label: 'Blog' });
    }
    return dedupeNav(provided);
  }

  const base = pages
    .filter(p => !['privacy','terms'].includes(p.slug))
    .sort((a,b) => a.slug.localeCompare(b.slug));

  const out = [];
  const home = base.find(p => p.slug === 'home' || p.slug === 'index');
  if (home) out.push({ href: '/', label: 'Home' });

  for (const p of base) {
    const href = (p.slug === 'home' || p.slug === 'index') ? '/' : `/${p.slug}/`;
    if (!out.some(i => i.href === href)) out.push({ href, label: prettyLabel(p.slug) });
    if (out.length >= 7) break;
  }
  if (posts.length && !out.some(i => i.href === '/blog/')) out.push({ href: '/blog/', label: 'Blog' });
  return dedupeNav(out);
}

function prettyLabel(slug=''){ if (!slug || slug==='home' || slug==='index') return 'Home'; return slug.replace(/-/g,' ').replace(/\b\w/g, m => m.toUpperCase()); }
function normalizeHref(slug){ const s = String(slug||'').trim().replace(/^\/+|\/+$/g,''); if (!s || s==='home' || s==='index') return '/'; return `/${s}/`; }
function dedupeNav(items){ const seen=new Set(); return items.filter(i=>{ if(seen.has(i.href))return false; seen.add(i.href); return true; }); }
