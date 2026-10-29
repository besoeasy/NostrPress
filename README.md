# NostrPress

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Turn your [Nostr](https://nostr.com) long-form posts into a minimal static blog. One command, no config, no database — the build fetches your notes, renders the site, and even narrates it. You ship a folder of files.

## Features

- **One command, zero config** — pass your `npub`, get a complete blog
- **Pure static output** — plain HTML/CSS/JS; host anywhere or drop it into an existing app
- **Audio narration** — every article synthesized into a natural-voiced MP3 with an in-page player, plus one full audio edition of the whole blog
- **Podcast-ready RSS** — iTunes tags and per-episode audio enclosures at `/feed.xml`, plus a sitemap (needs `SITE_URL`)
- **Build-time social cards** — an Open Graph image generated for every page, no runtime JS
- **Fast cached rebuilds** — changed posts re-render, untouched pages and audio stay cached
- **Dark / light themes** — follows OS preference, manual toggle, no flash
- **Tag pages, print stylesheet, mirrored media** — images and videos are downloaded and cached into the output

## Deploy

**Recommended — fork + GitHub Pages.** Free hosting, and a built-in workflow rebuilds the blog on a weekly schedule (or on demand from the **Actions** tab), so new Nostr notes appear on their own:

1. [Fork this repo](https://github.com/besoeasy/NostrPress/fork)
2. In your fork: **Settings → Secrets and variables → Actions** → add `NPUB` (your `npub1...` or `nprofile1...`)
3. **Settings → Pages** → Build and deployment → Source: **GitHub Actions** — that's it

It deploys on push, re-syncs weekly (Mondays 03:00 UTC), and can be triggered any time via **workflow dispatch** from the **Actions** tab.

### One-click deploys

| Provider | Deploy | Notes |
| :--- | :--- | :--- |
| **Vercel** | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbesoeasy%2FNostrPress&env=NPUB,SITE_URL&envDescription=NPUB%20is%20your%20Nostr%20public%20key%20(npub1...)%20or%20profile%20(nprofile1...).%20SITE_URL%20is%20optional%20(e.g.%20https%3A%2F%2Fmyblog.vercel.app)%20for%20RSS%20and%20sitemap.&envLink=https%3A%2F%2Fnostr.com&project-name=nostrpress-blog&repository-name=nostrpress-blog) | Prompts for `NPUB`; config in `vercel.json` |
| **Netlify** | [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/besoeasy/NostrPress#NPUB=&SITE_URL=) | Prompts for `NPUB`; config in `netlify.toml` |
| **Render** | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/besoeasy/NostrPress) | Prompts for `NPUB`; config in `render.yaml` |
| **Cloudflare Pages** | [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/besoeasy/NostrPress) | Build `npm run build`, output `dist` |

## Run it locally

```bash
npx github:besoeasy/NostrPress npub1...
```

Output lands in `dist/`. Pass `--url https://myblog.com` to enable the RSS feed, sitemap and podcast enclosure URLs.

## License

[MIT](LICENSE) © [Aman Singh Kattal](https://besoeasy.com)
