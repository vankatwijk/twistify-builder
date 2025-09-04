# Twistify Builder (Node)

A tiny, host-based static site builder + server. You POST a JSON payload of **pages/posts/blueprint** to `/api/build`, it renders HTML using a **theme**, writes to disk under `sites/<hostname>/public`, and serves it automatically based on the request **Host** header.

- **Multi-language**: default language at `/` (root), other languages at `/{locale}/…`
- **Themes**: pluggable (e.g. `classic`, `cyberchat`). If a theme doesn’t render a language switcher, the builder injects a fallback.
- **No DB** in Node—everything is file-based.

---

## Table of contents

- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [API](#api)
  - [POST /api/build](#post-apibuild)
  - [POST /api/reset](#post-apireset)
- [Payload schema](#payload-schema)
  - [Blueprint](#blueprint)
  - [Pages](#pages)
  - [Posts](#posts)
  - [Locales](#locales)
- [Output structure](#output-structure)
- [Routing & URLs](#routing--urls)
- [Themes](#themes)
- [Local development](#local-development)
- [Production deploy](#production-deploy)
  - [PM2 + Nginx](#pm2--nginx)
  - [Docker](#docker)
- [Troubleshooting](#troubleshooting)

---

## Quick start

```bash
# 1) Install deps
npm ci

# 2) Create .env
cat > .env <<'EOF'
PORT=8080
BUILDER_API_KEY=dev-key        # leave empty to disable auth (not recommended)
SITES_ROOT=./sites             # where sites will be stored
MAX_CONCURRENCY=6
EOF

# 3) Run
node index.js
# -> "Builder listening on :8080"
```

Test build:

```bash
curl -X POST http://localhost:8080/api/build   -H 'Content-Type: application/json'   -H 'X-Builder-Key: dev-key'   -d '{
    "blueprint": {
      "site_name": "Demo",
      "primary_domain": "demo.localhost",
      "theme": { "name": "classic", "primaryColor": "#2563eb", "accentColor":"#a855f7", "logoText":"Demo" },
      "default_locale": "en"
    },
    "locales": ["en","es"],
    "pages": [
      { "title":"Home", "slug":"home", "html":"<h1>Welcome</h1><p>Hello world.</p>", "locale":"en" },
      { "title":"Inicio", "slug":"home", "html":"<h1>Bienvenido</h1><p>Hola mundo.</p>", "locale":"es" },
      { "title":"About", "slug":"about", "html":"<h1>About us</h1><p>We build things.</p>", "locale":"en" }
    ],
    "posts": [
      { "title":"Hello", "slug":"hello", "html":"<h1>Hello</h1><p>Post body.</p>", "author":"Team", "published_at":"2025-01-01T00:00:00Z", "locale":"en" }
    ]
  }'
```

Then browse:

- `http://demo.localhost:8080/` → **en** (root)
- `http://demo.localhost:8080/es/` → Spanish
- `http://demo.localhost:8080/blog/hello/` → Blog post

> On macOS, add `127.0.0.1 demo.localhost` to `/etc/hosts`, or just set `Host: demo.localhost` in your HTTP client.

---

## Environment variables

| Key               | Default | Description |
|-------------------|---------|-------------|
| `PORT`            | `8080`  | HTTP port for the Node server. |
| `BUILDER_API_KEY` | _(empty)_ | If set, requests to `/api/*` must include header `X-Builder-Key: <value>`. |
| `SITES_ROOT`      | `./sites` | Parent folder where sites are persisted: `sites/<hostname>/public`. |
| `MAX_CONCURRENCY` | `6`     | Parallelism when rendering pages/posts. |

---

## API

### POST `/api/build`

Triggers a (re)build for a hostname. The hostname is taken from `blueprint.primary_domain` (or `dns.hostname` if you pass it).

**Headers:**

- `Content-Type: application/json`
- `X-Builder-Key: <key>` (required if `BUILDER_API_KEY` is set)

**Body:** see [Payload schema](#payload-schema)

**Response:**

```json
{
  "ok": true,
  "job_id": "mbe7u9",
  "hostname": "demo.localhost",
  "pages": 3,
  "posts": 1,
  "theme": "classic",
  "locales": ["en","es"],
  "default_locale": "en"
}
```

### POST `/api/reset`

Deletes a site entirely (dangerous).

**Body:**

```json
{ "hostname": "demo.localhost" }
```

**Response:**

```json
{ "ok": true, "message": "Deleted demo.localhost" }
```

---

## Payload schema

Top-level:

```json
{
  "blueprint": { ... },
  "locales": ["en","es","fr"],      // optional; defaults to ["en"]
  "pages": [ { ... }, ... ],        // array of page docs
  "posts": [ { ... }, ... ],        // array of post docs
  "dns": { "hostname": "demo.localhost" }, // optional; not used for DNS changes
  "reset": true                     // optional; wipe folder before building
}
```

### Blueprint

```json
{
  "site_name": "My Site",
  "primary_domain": "demo.localhost",
  "default_locale": "en",
  "theme": {
    "name": "classic",              // e.g. classic, cyberchat
    "logoText": "My Site",
    "primaryColor": "#2563eb",
    "accentColor": "#a855f7",
    "font": "Inter, system-ui, ...",
    "nav": {
      "includeBlog": true,
      "items": [
        { "title": "Home", "slug": "home" },
        { "title": "About", "slug": "about" }
      ]
    }
  },
  "settings": {}                    // reserved for future use
}
```

### Pages

```json
{
  "title": "About",
  "slug": "about",                  // no leading/trailing slash
  "html": "<h1>About</h1><p>...</p>",
  "meta_title": "About us",         // <= 60 chars (optional)
  "meta_description": "Desc",       // <= 160 chars (optional)
  "media_links": ["https://..."],   // optional; first used for og:image
  "locale": "en"                    // optional; defaults to blueprint.default_locale
}
```

### Posts

```json
{
  "title": "Hello",
  "slug": "hello",
  "html": "<h1>Hello</h1><p>...</p>",
  "meta_title": "Hello Post",
  "meta_description": "Short summary",
  "author": "Team",                 // optional
  "category": "General",            // optional
  "published_at": "2025-01-01T00:00:00Z",
  "media_links": ["https://..."],
  "locale": "en"
}
```

### Locales

- `locales`: array like `["en","es","ja"]`
- `blueprint.default_locale`: which one renders at **root** (`/`). Others render under `/{locale}/…`.
- You can provide translated versions per page/post by providing the **same `slug`** and a different `locale`.

Example (two locales for `home`):

```json
"pages": [
  { "title":"Home",   "slug":"home", "html":"<h1>Welcome</h1>",   "locale":"en" },
  { "title":"Inicio", "slug":"home", "html":"<h1>Bienvenido</h1>","locale":"es" }
]
```

---

## Output structure

After a build, you’ll have:

```
sites/<hostname>/
  public/
    index.html                   # root = default locale
    about/index.html
    blog/<slug>/index.html
    es/                          # other locales
      index.html
      about/index.html
      blog/<slug>/index.html
    sitemap.xml                  # includes all locales’ URLs
    rss.xml                      # default locale posts
    rss.es.xml                   # per-locale rss for others
    assets/<theme>/
      style.css                  # fallback/base (auto)
      vars.css                   # from themeConfig (auto)
      classic.css                # your theme stylesheet (if present)
  manifest.json                  # build manifest (theme, locales, pages/posts)
```

> The server serves from `public` using clean URLs—e.g. `/about` → `/about/index.html`.

---

## Routing & URLs

- **Pages**: `/` (home), `/<slug>/`
- **Posts**: `/blog/<slug>/`
- **Locales**: default locale renders at root; others at `/{locale}/...`
- **Sitemap**: `sitemap.xml` contains **all** locales.
- **RSS**: `rss.xml` (default locale), `rss.<loc>.xml` (others)
- **Canonical** links are injected per page/post.

---

## Themes

- Resides under `themes/<name>/template.js`
- Must export `render()` and (optionally) `prepare()`. Our loader normalizes this and adds asset copying.
- Select via `blueprint.theme.name`.

**Classic theme**

- Header with nav + language switcher (`data-lang-switcher`).
- Two-column layout (content + sidebar).
- Styles from `/assets/classic/style.css` (base), `/assets/classic/vars.css` (from config), and `/assets/classic/classic.css` (your file if present).

**Language switcher**

- If a theme omits it, the builder injects a small floating `lm-lang-switcher` before `</body>` so language switching is always available.

---

## Local development

1) **Run**:

```bash
npm ci
node index.js
# or: npx nodemon index.js
```

2) **Build** a site using `curl` (see Quick start).

3) **Hosts**: add `127.0.0.1 demo.localhost` to `/etc/hosts` and open `http://demo.localhost:8080/`.

---

## Production deploy

### PM2 + Nginx

**PM2**

```bash
npm ci
cp .env.example .env   # set PORT, BUILDER_API_KEY, SITES_ROOT
npx pm2 start index.js --name twistify-builder
npx pm2 save
npx pm2 startup        # optional: boot on restart
```

**Nginx** (reverse proxy & Host-based routing)

```nginx
server {
  listen 80;
  server_name _;
  client_max_body_size 25m;   # matches express json limit

  location / {
    proxy_pass         http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header   Host $host;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
  }
}
```

Point your domains’ A/AAAA records to this server’s IP. The Node app serves the correct site based on the `Host` header.

### Docker

**Dockerfile**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node","index.js"]
```

**docker-compose.yml**

```yaml
services:
  builder:
    build: .
    ports: ["8080:8080"]
    environment:
      PORT: 8080
      BUILDER_API_KEY: ${BUILDER_API_KEY}
      SITES_ROOT: /data/sites
      MAX_CONCURRENCY: 6
    volumes:
      - ./data:/data
```

Then:

```bash
docker compose up -d
```

---

## Troubleshooting

- **401 Unauthorized**: Set `BUILDER_API_KEY` in `.env` and include `X-Builder-Key` in your request.
- **No styling**:
  - Confirm these exist after a build:  
    `sites/<host>/public/assets/<theme>/{style.css,vars.css}`  
    and (if provided) `classic.css`.
  - View source: the CSS links should be `200`.
- **Locale redirect loops / 404**:
  - Default locale is rendered at root `/`. Do **not** redirect `/` to `/<default>/`.
  - Other locales must have their translated pages present (same slug, different `locale`).
- **Double locale path (`/es/es/...`)**:
  - Send `slug` without locale prefixes; locale is a separate field.
- **Theme errors (`prepare is not a function`)**:
  - Ensure your theme exports either named `{ render, prepare }` or a default object with those keys. The loader also polyfills `prepare`.

---

## FAQ

**Does Node change DNS?**  
No. It only writes files. Use Cloudflare/API upstream to point your domain to this server. The server serves by `Host` header (`sites/<host>/public`).

**Can I add custom assets?**  
Yes, put them under `themes/<name>/assets/*`. They’ll be copied to `/assets/<name>/…` and can be referenced from HTML.

**How is the navigation built?**  
- If `blueprint.theme.nav.items` is provided, it’s used (plus optional “Blog” if `includeBlog=true` and posts exist).
- Otherwise, it’s derived from your pages (Home + first few pages, plus Blog if posts exist).