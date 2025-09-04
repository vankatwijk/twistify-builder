// server.js
import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { buildSite, removeSiteCompletely } from './lib/build-site.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.BUILDER_API_KEY || '';
const SITES_ROOT = process.env.SITES_ROOT || path.join(__dirname, 'sites');

await fs.mkdir(SITES_ROOT, { recursive: true });

app.use(morgan('combined'));
app.use(express.json({ limit: '25mb' }));

// cache site.config.json
const siteCfgCache = new Map(); // host -> { mtimeMs, config }
async function getSiteConfig(sitesRoot, host) {
  try {
    const cfgPath = path.join(sitesRoot, host, 'site.config.json');
    const stat = await fs.stat(cfgPath);
    const cached = siteCfgCache.get(host);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.config;
    const cfg = JSON.parse(await fs.readFile(cfgPath, 'utf8'));
    siteCfgCache.set(host, { mtimeMs: stat.mtimeMs, config: cfg });
    return cfg;
  } catch { return null; }
}

// tiny auth
function requireKey(req, res, next) {
  const k = req.header('X-Builder-Key') || '';
  if (!API_KEY || k === API_KEY) return next();
  return res.status(401).json({ ok: false, message: 'Unauthorized' });
}

// BUILD
app.post('/api/build', requireKey, async (req, res) => {
  try {
    const payload  = req.body || {};
    const hostname = (payload?.dns?.hostname || payload?.blueprint?.primary_domain || '').toLowerCase().trim();
    if (!hostname) return res.status(422).json({ ok: false, message: 'hostname required (dns.hostname or blueprint.primary_domain)' });

    const locales = Array.isArray(payload.locales) && payload.locales.length ? payload.locales : ['en'];
    payload.blueprint = payload.blueprint || {};
    payload.blueprint.default_locale = payload.blueprint.default_locale || locales[0];

    if (payload.reset) await removeSiteCompletely(SITES_ROOT, hostname);

    const result = await buildSite({
      sitesRoot: SITES_ROOT,
      hostname,
      blueprint: payload.blueprint,
      locales,
      pages: Array.isArray(payload.pages) ? payload.pages : [],
      posts: Array.isArray(payload.posts) ? payload.posts : [],
    });

    // store runtime cfg
    await fs.writeFile(
      path.join(SITES_ROOT, hostname, 'site.config.json'),
      JSON.stringify({ default_locale: payload.blueprint.default_locale, locales }, null, 2),
      'utf8'
    );

    return res.json({ ok: true, job_id: Date.now().toString(36), ...result });
  } catch (err) {
    console.error('BUILD ERROR', err);
    return res.status(500).json({ ok: false, message: String(err?.message || err) });
  }
});

// RESET
app.post('/api/reset', requireKey, async (req, res) => {
  try {
    const hostname = (req.body?.hostname || '').toLowerCase().trim();
    if (!hostname) return res.status(422).json({ ok: false, message: 'hostname required' });
    await removeSiteCompletely(SITES_ROOT, hostname);
    return res.json({ ok: true, message: `Deleted ${hostname}` });
  } catch (err) {
    console.error('RESET ERROR', err);
    return res.status(500).json({ ok: false, message: String(err?.message || err) });
  }
});

// host-based static
app.use(async (req, res, next) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  const siteRoot = path.join(SITES_ROOT, host);
  const docRoot  = path.join(siteRoot, 'public');

  if (!existsSync(docRoot)) return next();

  const cfg = await getSiteConfig(SITES_ROOT, host);
  const def = cfg?.default_locale;
  const locales = Array.isArray(cfg?.locales) ? cfg.locales : [];

  // canonicalize default-locale prefix back to root (/en/about -> /about)
  if (def && (req.path === `/${def}` || req.path.startsWith(`/${def}/`))) {
    const stripped = req.path.replace(new RegExp(`^/${def}`), '') || '/';
    return res.redirect(301, stripped);
  }

  // normalize non-default locale root: /es -> /es/
  if (locales.length) {
    const parts = req.path.split('/').filter(Boolean);
    if (parts.length === 1) {
      const maybeLocale = parts[0];
      if (maybeLocale && maybeLocale !== def && locales.includes(maybeLocale)) {
        return res.redirect(302, `/${maybeLocale}/`);
      }
    }
  }

  express.static(docRoot, { extensions: ['html'] })(req, res, () => next());
});

// 404
app.use((req, res) => res.status(404).send('Not Found'));

app.listen(PORT, () => console.log(`Builder listening on :${PORT}`));
