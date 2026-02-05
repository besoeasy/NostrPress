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

**GitHub Pages**: Fork this repo and enable the included GitHub Actions workflow (`.github/workflows/deploy.yml`)

**Option 2: Run with npx**

```bash
NPUB=your_npub BASE_URL=https://yourdomain.com npx github:besoeasy/NostrPress
```

Generates a static site in `./dist` folder. Deploy to any hosting platform or browse locally.

## Configuration

| Variable      | Required | Description                            |
| ------------- | -------- | -------------------------------------- |
| `NPUB`        | ✅       | Your Nostr public key                  |
| `BASE_URL`    | ❌       | Base URL (auto-detected on most hosts) |
| `RELAYS`      | ❌       | Comma-separated relay URLs             |
| `OUTPUT_DIR`  | ❌       | Output directory (default: `./dist`)   |
| `MAX_SIZE_MB` | ❌       | Max media file size (default: 20)      |

## Features

Static blog with tags, RSS, sitemap, reading time, Nostr comments, media caching, and responsive design.
