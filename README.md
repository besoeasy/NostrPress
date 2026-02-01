# NostrPress

Generate a modern static blog from your Nostr long-form posts (kind 30023).

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/besoeasy/NostrPress&env=NPUB&envDescription=Your%20Nostr%20public%20key%20(npub1...)&project-name=nostrpress-blog)

Click the button above to deploy to Vercel. You'll be prompted to enter your `NPUB`.

## Build

```bash
npm run build
```

Generates static site in `./dist`

## Deploy

Deploy `dist/` folder to any static host:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

No configuration needed - works standalone.

## Environment Variables

| Variable      | Required | Description                            |
| ------------- | -------- | -------------------------------------- |
| `NPUB`        | ✅       | Your Nostr public key                  |
| `RELAYS`      | ❌       | Comma-separated relay URLs             |
| `OUTPUT_DIR`  | ❌       | Output directory (default: `./dist`)   |
| `MAX_SIZE_MB` | ❌       | Max media file size (default: 20)      |
| `BASE_URL`    | ❌       | Auto-detected from deployment platform |

## Features

- 📝 Pulls long-form posts from Nostr
- 🎨 Modern, responsive design
- 🖼️ Featured images
- 💬 Comments support
- 🏷️ Tags & categories
- 📱 Mobile-friendly
- ⚡ Fast static HTML
