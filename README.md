# NostrPress

[![npm version](https://img.shields.io/npm/v/nostrpress.svg)](https://www.npmjs.com/package/nostrpress)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Turn your [Nostr](https://nostr.com) long-form posts ([NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md)) into a fast, standalone static blog. One command, no config.

📦 **Available on npm:** [npmjs.com/package/nostrpress](https://www.npmjs.com/package/nostrpress)

---

## ⚡ Quick Deploy (Free 1-Click Hosting)

Deploy your own live, auto-updating Nostr blog for free with one click:

| Provider | One-Click Deploy | Configuration |
| :--- | :--- | :--- |
| **Vercel** | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbesoeasy%2FNostrPress&env=NPUB,SITE_URL&envDescription=NPUB%20is%20your%20Nostr%20public%20key%20(npub1...)%20or%20profile%20(nprofile1...).%20SITE_URL%20is%20optional%20(e.g.%20https%3A%2F%2Fmyblog.vercel.app)%20for%20RSS%20and%20sitemap.&envLink=https%3A%2F%2Fnostr.com&project-name=nostrpress-blog&repository-name=nostrpress-blog) | Configured via `vercel.json`. Prompts for your `NPUB`. |
| **Netlify** | [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/besoeasy/NostrPress#NPUB=&SITE_URL=) | Configured via `netlify.toml`. Prompts for your `NPUB`. |
| **Render** | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/besoeasy/NostrPress) | Configured via `render.yaml`. Prompts for your `NPUB`. |
| **Cloudflare Pages** | [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/besoeasy/NostrPress) | Global edge CDN. Build: `npm run build`, Output: `blog`. |
| **GitHub Pages** | [![Deploy to GitHub Pages](https://img.shields.io/badge/Deploy%20to-GitHub%20Pages-181717?style=flat&logo=github)](https://github.com/besoeasy/NostrPress/fork) | 100% free with auto-sync schedule via [GitHub Actions](#github-pages-100-free--auto-sync). |

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

### GitHub Pages (100% Free & Auto-Sync)

NostrPress includes a pre-configured GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) that builds your blog and automatically syncs new Nostr articles:

1. **[Fork this repository](https://github.com/besoeasy/NostrPress/fork)** to your GitHub account.
2. In your fork, go to **Settings** > **Secrets and variables** > **Actions** and add:
   - `NPUB`: Your Nostr public key (`npub1...` or `nprofile1...`).
   - `SITE_URL` *(optional)*: `https://<your-username>.github.io/<repo-name>` (enables RSS feed & sitemap).
3. Go to **Settings** > **Pages**, and under **Build and deployment** > **Source**, select **GitHub Actions**.
4. That's it! Your blog will deploy immediately and re-sync every 12 hours whenever you publish new Nostr articles.

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
