# NostrPress

Turn your [Nostr](https://nostr.com) long-form posts into a static blog. One command, no config.

---

## How it works

1. You pass your `npub` key
2. NostrPress fetches your articles from Nostr relays
3. It downloads media and generates a complete static site into `./blog`
4. Drop that folder anywhere — any host, any framework

---

## Run it

**npx**
```bash
NPUB=npub1... npx github:besoeasy/NostrPress
```

**bun**
```bash
NPUB=npub1... bunx github:besoeasy/NostrPress
```

Output lands in `./blog/` — ready to serve.

---

## Use with any framework

The generated `./blog` folder is pure static HTML/CSS/JS. Copy it into your framework's public/static directory and it's served as-is.

### Vue (Vite)

```json
// package.json
{
  "scripts": {
    "blog:fetch": "NPUB=npub1... npx github:besoeasy/NostrPress && cp -r ./blog ./public/blog",
    "dev": "vite",
    "build": "npm run blog:fetch && vite build",
    "preview": "vite preview"
  }
}
```

Blog lives at `/blog/` alongside your Vue app. No vite config changes needed — Vite serves everything in `public/` automatically.

---

### React (Vite or CRA)

**Vite + React** — same as Vue above, just swap the plugin:

```json
{
  "scripts": {
    "blog:fetch": "NPUB=npub1... npx github:besoeasy/NostrPress && cp -r ./blog ./public/blog",
    "dev": "vite",
    "build": "npm run blog:fetch && vite build"
  }
}
```

**Create React App**

```json
{
  "scripts": {
    "blog:fetch": "NPUB=npub1... npx github:besoeasy/NostrPress && cp -r ./blog ./public/blog",
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
    "blog:fetch": "NPUB=npub1... npx github:besoeasy/NostrPress && cp -r ./blog ./public/blog",
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
    "blog:fetch": "NPUB=npub1... npx github:besoeasy/NostrPress && cp -r ./blog ./public/blog",
    "dev": "next dev",
    "build": "npm run blog:fetch && next build"
  }
}
```

---

### Plain HTML / no framework

```bash
NPUB=npub1... npx github:besoeasy/NostrPress
# serve ./blog with any static host
npx serve ./blog
```

---

## What you get

```
blog/
├── index.html          ← homepage with all posts
├── your-post-slug.html ← individual article pages
├── tags/
│   └── tag-name/
│       └── index.html  ← posts filtered by tag
├── assets/
│   └── images/         ← downloaded media, cached locally
├── css/
│   └── site.css
└── js/
    └── site.js
```

---

## Environment variables

| Variable   | Required | Description |
|------------|----------|-------------|
| `NPUB`     | ✅ yes   | Your Nostr public key (`npub1...`) |
| `SITE_URL` | optional | Canonical base URL (e.g. `https://myblog.com`). When set, enables: RSS feed (`/feed.xml`), sitemap (`/sitemap.xml`), canonical link tags, and Open Graph absolute URLs. |

### Example with SITE_URL

```bash
NPUB=npub1... SITE_URL=https://myblog.com npx github:besoeasy/NostrPress
```

This generates:

```
blog/
├── feed.xml       ← RSS 2.0 feed (latest 20 posts)
├── sitemap.xml    ← XML sitemap (all pages + tag pages)
└── ...
```

