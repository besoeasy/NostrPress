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

