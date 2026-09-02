# NostrPress

[![npm version](https://img.shields.io/npm/v/nostrpress.svg)](https://www.npmjs.com/package/nostrpress)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Turn your [Nostr](https://nostr.com) long-form posts ([NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md)) into a fast, standalone static blog. One command, no config.

📦 **Available on npm:** [npmjs.com/package/nostrpress](https://www.npmjs.com/package/nostrpress)

---

## How it works

1. You pass your `npub` or `nprofile`
2. NostrPress fetches your articles, profile, and comments from Nostr relays
3. It downloads media assets, caches them locally, and generates a static site into `./blog` (or custom `--out` directory)
4. Drop that folder anywhere — any host, any framework

---

## Run it

**Direct CLI Arguments (via npx)**
```bash
npx nostrpress npub1...
npx nostrpress npub1... --out ./public/blog --url https://myblog.com
```

**Environment Variables**
```bash
NPUB=npub1... npx nostrpress
```

**Bun**
```bash
bunx nostrpress npub1...
```

Output lands in `./blog/` (or your `--out` directory) — ready to serve.

---

## Use with any framework

The generated `./blog` folder is pure static HTML/CSS/JS. Output directly to your framework's public directory with `--out` (or copy it):

### Vue (Vite)

```json
// package.json
{
  "scripts": {
    "blog:fetch": "npx nostrpress npub1... --out ./public/blog",
    "dev": "vite",
    "build": "npm run blog:fetch && vite build",
    "preview": "vite preview"
  }
}
```

Blog lives at `/blog/` alongside your Vue app. No vite config changes needed — Vite serves everything in `public/` automatically.

---

### React (Vite or CRA)

**Vite + React**:

```json
{
  "scripts": {
    "blog:fetch": "npx nostrpress npub1... --out ./public/blog",
    "dev": "vite",
    "build": "npm run blog:fetch && vite build"
  }
}
```

**Create React App**:

```json
{
  "scripts": {
    "blog:fetch": "npx nostrpress npub1... --out ./public/blog",
    "start": "react-scripts start",
    "build": "npm run blog:fetch && react-scripts build"
  }
}
```

---

### Nuxt

```json
{
  "scripts": {
    "blog:fetch": "npx nostrpress npub1... --out ./public/blog",
    "dev": "nuxt dev",
    "build": "npm run blog:fetch && nuxt build",
    "generate": "npm run blog:fetch && nuxt generate"
  }
}
```

---

### Next.js

```json
{
  "scripts": {
    "blog:fetch": "npx nostrpress npub1... --out ./public/blog",
    "dev": "next dev",
    "build": "npm run blog:fetch && next build"
  }
}
```

---

### Plain HTML / Static Hosting

```bash
npx nostrpress npub1...
# serve ./blog with any static web server
npx serve ./blog
```

---

## What you get

```
blog/
├── index.html          ← homepage with profile & post index
├── your-post-slug.html ← individual article pages
├── tags/
│   └── tag-name/
│       └── index.html  ← posts filtered by tag
├── assets/
│   ├── images/         ← downloaded & cached media assets
│   └── videos/         ← downloaded & cached video files
├── css/
│   ├── site.css        ← compiled stylesheet
│   └── print.css       ← print stylesheet
└── js/
    └── site.js         ← theme switcher & client helpers
```

---

## CLI Options & Flags

| Flag | Description | Default |
|------|-------------|---------|
| `<npub_or_nprofile>` | Your Nostr public key (`npub1...`) or profile (`nprofile1...`) | Positional |
| `-n, --npub <key>` | Explicit flag for `npub` or `nprofile` | `$NPUB` |
| `-o, --out <dir>` | Output folder for static blog | `./blog` |
| `-u, --url <url>` | Canonical site URL (enables RSS feed, sitemap & SEO tags) | `$SITE_URL` |
| `-r, --relay <relay>` | Custom relay URL (can be specified multiple times) | Default relays + NIP-65 |
| `-c, --clean` | Clear local cache before building | `false` |
| `--no-media` | Skip downloading media assets locally | `false` |
| `-h, --help` | Show help message | — |
| `-v, --version` | Show version | — |

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NPUB` | ✅ yes (or pass as CLI arg) | Your Nostr public key (`npub1...`) or profile (`nprofile1...`) |
| `SITE_URL` | optional | Canonical base URL (e.g. `https://myblog.com`). Enables RSS (`/feed.xml`), sitemap (`/sitemap.xml`), and canonical link tags. |
| `OUTPUT_DIR` | optional | Output destination (default: `./blog`) |
| `RELAYS` | optional | Comma-separated list of custom relays |
| `CLEAN` | optional | Set to `true` to clear cache before build |

### Example with Site URL & Custom Output

```bash
npx nostrpress npub1... --out ./public/blog --url https://myblog.com
```

This generates:

```
public/blog/
├── index.html     ← homepage with all posts & profile
├── feed.xml       ← RSS 2.0 feed (latest 20 posts)
├── sitemap.xml    ← XML sitemap (all pages + tag pages)
├── tags/          ← tag archive pages
├── assets/        ← locally downloaded and cached media
└── ...
```

---

## License

[MIT](LICENSE) © [Aman Singh Kattal](https://besoeasy.com)
