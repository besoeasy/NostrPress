# NostrPress

Generate a modern static blog from your Nostr long-form posts (kind 30023). Publish once on Nostr, get a SEO-optimized website automatically.

## Quick Start

**Option 1: One-click deploy**

[![Deploy with Vercel](https://vercel.com/button)](<https://vercel.com/new/clone?repository-url=https://github.com/besoeasy/NostrPress&env=NPUB&envDescription=Your%20Nostr%20public%20key%20(npub1...)&project-name=nostrpress-blog>)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/besoeasy/NostrPress)

**Option 2: Run with npx**

```bash
NPUB=your_npub npx github:besoeasy/NostrPress
```

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
