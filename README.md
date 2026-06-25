# NostrPress

Generate a modern static blog from your [Nostr](https://github.com/nostr-protocol/nostr) long-form posts (kind 30023). Publish once on Nostr, get a SEO-optimized website automatically.

## Quick Start

**Option 1: One-click deploy**

[![Deploy with Vercel](https://vercel.com/button)](<https://vercel.com/new/clone?repository-url=https://github.com/besoeasy/NostrPress&env=NPUB&envDescription=Your%20Nostr%20public%20key%20(npub1...)&project-name=nostrpress-blog>)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/besoeasy/NostrPress)
[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/besoeasy/NostrPress)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/besoeasy/NostrPress)
[![Deploy to AWS Amplify](https://oneclick.amplifyapp.com/button.svg)](https://console.aws.amazon.com/amplify/home#/deploy?repo=https://github.com/besoeasy/NostrPress)
[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.StaticApp)

**Option 2: Run with npx**

```bash
NPUB=your_npub npx github:besoeasy/NostrPress
```

Generates a static site in `./blog` folder. Deploy to any hosting platform or browse locally.

## Configuration

| Variable | Required | Description           |
| -------- | -------- | --------------------- |
| `NPUB`   | ✅       | Your Nostr public key |

## Features

Static blog with tags, reading time, Nostr comments, media caching, and responsive design.

## Vite Integration

If you are building a Vite + Vue 3 app and want to serve the generated blog at `/blog/`, copy the output into Vite's `public/` directory so it is served as-is at build time.

**1. Generate the blog output**

```bash
NPUB=your_npub npx github:besoeasy/NostrPress
# Output is written to ./blog/
```

**2. Copy `blog/` into your Vite project's `public/` folder**

```bash
cp -r ./blog ./your-vite-project/public/blog
```

Your project structure will look like:

```
your-vite-project/
├── public/
│   └── blog/          ← static blog files served at /blog/
│       ├── index.html
│       └── ...
├── src/
│   └── ...
├── vite.config.js
└── package.json
```

**3. `vite.config.js`** — no special config needed; Vite serves everything inside `public/` automatically.

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
})
```

**4. Access your blog**

| Mode | URL |
|------|-----|
| Dev server | `http://localhost:5173/blog/` |
| Production build | `https://yourdomain.com/blog/` |

> **Tip:** Run `npm run dev` and open `http://localhost:5173/blog/` to preview the blog alongside your Vue app.

**5. Automate in `package.json`** (optional)

Add a script that generates and copies the blog before building:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "blog:fetch": "NPUB=your_npub npx github:besoeasy/NostrPress && cp -r ./blog ./public/blog",
    "build:all": "npm run blog:fetch && npm run build"
  }
}
```

Run `npm run build:all` to fetch the latest Nostr posts and produce a complete production build.

---

## GitHub Actions

Create `.github/workflows/blog.yml`:

Change your_npub to nostr NPUB

```yaml
name: Build & Publish Blog

on:
  schedule:
    - cron: "0 0 */3 * *"   # every 3 days at midnight UTC
  workflow_dispatch:         # allow manual trigger

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Generate blog
        run: NPUB=your_npub npx github:besoeasy/NostrPress

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./blog
```

