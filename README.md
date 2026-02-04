# NostrPress

Generate a modern static blog from your [Nostr](https://github.com/nostr-protocol/nostr) long-form posts (kind 30023). Publish once on Nostr, get a SEO-optimized website automatically.

## Quick Start

**Option 1: One-click deploy**

[![Deploy with Vercel](https://vercel.com/button)](<https://vercel.com/new/clone?repository-url=https://github.com/besoeasy/NostrPress&env=NPUB&envDescription=Your%20Nostr%20public%20key%20(npub1...)&project-name=nostrpress-blog>)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/besoeasy/NostrPress)

**Option 2: Run with npx**

```bash
NPUB=your_npub BASE_URL=https://yourdomain.com npx github:besoeasy/NostrPress
```

Generates a static site in `./dist` folder. Deploy to any hosting platform or browse locally.

## Recommended Deployment

**Fork this repository and deploy via GitHub Actions** for the best experience:

1. Fork this repo to your GitHub account
2. Set environment variables in your fork's repository settings (Settings → Secrets and variables → Actions)
   - Add `NPUB` as a repository variable
   - Add `BASE_URL` as a repository variable
   - Add any other configuration variables as needed
3. Set up GitHub Actions to build and deploy your site

This approach ensures you can always run the latest version with bug fixes and new features while maintaining your own configuration.

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
