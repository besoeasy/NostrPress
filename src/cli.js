import dns from "node:dns";
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

import "./nostr/ws.js";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SimplePool } from "nostr-tools";
import { loadConfig } from "./config/loadConfig.js";
import { resolveIdentity, fetchUserRelays, fetchProfileMetadata, fetchArticles, fetchComments, clearClientCache } from "./nostr/client.js";
import { parseArticle } from "./parser/articleParser.js";
import { processMedia, rewriteArticleContent, clearMediaCache } from "./media/mediaPipeline.js";
import { renderMarkdown, renderSite, calculateReadingTime } from "./render/render.js";
import { generateSocialCards } from "./render/ogImages.js";
import { generateAudio } from "./render/audio.js";
import { normalizeTag } from "./utils/slugify.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── Progress logger ──────────────────────────────────────────────────────────

let stepIndex = 0;
let totalSteps = 0;
let buildStart = 0;

function initProgress(steps) {
  totalSteps = steps;
  stepIndex = 0;
  buildStart = Date.now();
}

function step(label) {
  stepIndex++;
  const pad = String(stepIndex).padStart(String(totalSteps).length, " ");
  process.stdout.write(`\n  [${pad}/${totalSteps}] ${label}...`);
}

function stepDone(detail = "") {
  if (detail) process.stdout.write(` ${detail}`);
}

function printSummary(stats) {
  const elapsed = ((Date.now() - buildStart) / 1000).toFixed(1);
  console.log("\n");
  console.log(`  ✓ Built ${stats.articles} article${stats.articles !== 1 ? "s" : ""}`);
  if (stats.assets > 0) {
    console.log(`  ✓ Downloaded ${stats.assets} media asset${stats.assets !== 1 ? "s" : ""}`);
  }
  if (stats.rss) console.log(`  ✓ RSS feed  → ${stats.rss}`);
  if (stats.jsonFeed) console.log(`  ✓ JSON feed → ${stats.jsonFeed}`);
  if (stats.sitemap) console.log(`  ✓ Sitemap   → ${stats.sitemap}`);
  if (stats.audio) {
    console.log(`  ✓ Narration → audio/${stats.audio.items[0]?.slug || ""}.mp3 + audio/whole-blog.mp3 (${stats.audio.wholeBlog?.minutes} min)`);
  }
  console.log(`  ✓ Output    → ${stats.outputDir}`);
  console.log(`  ✓ Done in ${elapsed}s`);
  console.log();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanOutput(outputDir) {
  ensureDir(outputDir);
  ensureDir(path.join(outputDir, "assets", "images"));
  ensureDir(path.join(outputDir, "assets", "videos"));
  ensureDir(path.join(outputDir, "css"));
  ensureDir(path.join(outputDir, "js"));
}

function normalizeSummary(content, summary) {
  if (summary && summary.trim()) return summary;
  const text = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/[#>*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 180);
}

function sortArticles(articles) {
  return [...articles].sort((a, b) => {
    if (b.published_at !== a.published_at) return b.published_at - a.published_at;
    return a.id.localeCompare(b.id);
  });
}

// NIP-23 events can be republished/edited, producing multiple events with the
// same `d` tag (slug). Keep a single version per slug, preferring the one with
// a cover image, then the newest.
function dedupeArticles(articles) {
  const bySlug = new Map();
  for (const article of articles) {
    const existing = bySlug.get(article.slug);
    if (!existing) {
      bySlug.set(article.slug, article);
      continue;
    }
    const existingHasImage = Boolean(existing.image);
    const newHasImage = Boolean(article.image);
    if (newHasImage && !existingHasImage) {
      bySlug.set(article.slug, article);
    } else if (newHasImage === existingHasImage && article.published_at > existing.published_at) {
      bySlug.set(article.slug, article);
    }
  }
  return [...bySlug.values()];
}

// Tags can repeat in variant form ("Debian", "debian", "Debian ") and every
// variant slugifies to the same page — collapse them to the first occurrence
// so tag chips, RSS categories and tag pages list each article once.
function dedupeArticleTags(articles) {
  for (const article of articles) {
    if (!article.tags?.length) continue;
    const seen = new Set();
    article.tags = article.tags.filter((tag) => {
      const slug = normalizeTag(tag);
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
  }
  return articles;
}

function buildContext(config, npub, pubkey, profile, articles) {
  const siteTitle = config.site.title === "auto" ? profile.display_name || profile.name || npub : config.site.title;
  const siteDescription = config.site.description === "auto" ? profile.about || `Posts by ${siteTitle}` : config.site.description;

  return {
    site: {
      title: siteTitle,
      description: siteDescription,
      url: config.site.url || "",
    },
    author: {
      npub,
      pubkey,
      profile,
    },
    articles,
  };
}

function writeStaticAssets(outputDir, rootDir) {
  const srcJs = path.join(rootDir, "src/static/site.js");
  const destJs = path.join(outputDir, "js", "site.js");
  if (fs.existsSync(srcJs)) {
    fs.copyFileSync(srcJs, destJs);
  } else {
    fs.writeFileSync(destJs, "");
  }

  // Copy print.css
  const srcPrintCss = path.join(rootDir, "src/styles/print.css");
  const destPrintCss = path.join(outputDir, "css", "print.css");
  if (fs.existsSync(srcPrintCss)) {
    fs.copyFileSync(srcPrintCss, destPrintCss);
  }

  // Copy favicon files
  const faviconFiles = ["favicon.ico", "favicon.svg", "favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png"];

  for (const file of faviconFiles) {
    const srcFile = path.join(rootDir, "src/static", file);
    const destFile = path.join(outputDir, file);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
    }
  }
}

function runTailwind(outputDir, rootDir) {
  const require = createRequire(import.meta.url);
  const tailwindCli = require.resolve("tailwindcss/lib/cli.js");
  const input = path.join(rootDir, "src/styles/tailwind.css");
  const output = path.join(outputDir, "css", "site.css");
  const config = path.join(rootDir, "tailwind.config.cjs");

  execFileSync(process.execPath, [tailwindCli, "-c", config, "-i", input, "-o", output], {
    stdio: "inherit",
    cwd: rootDir,
  });
}

// ── RSS Generation ────────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateRss(context, outputDir, audioItems = []) {
  const siteUrl = context.site.url;
  if (!siteUrl) return null;

  const { title, description } = context.site;
  const author = context.author.profile;
  const authorName = author.display_name || author.name || title;
  const articles = context.articles.slice(0, 20); // RSS: latest 20

  // Podcast metadata: stories with narration attach their build-time MP3 as
  // an <enclosure>, turning feed.xml into a subscribable podcast feed.
  const audioBySlug = new Map(audioItems.map((i) => [i.slug, i]));
  const coverUrl = `${siteUrl.replace(/\/+$/, "")}/og.png`;
  const base = `${siteUrl.replace(/\/+$/, "")}`;

  const items = articles.map((article) => {
    const articleUrl = `${base}/${article.slug}.html`;
    const pubDate = new Date(article.published_at).toUTCString();
    const tags = (article.tags || []).map((t) => `      <category>${escapeXml(t)}</category>`).join("\n");

    // Enclosure only when the clip actually exists in this build.
    let audioTags = "";
    const audio = audioBySlug.get(article.slug);
    const audioFile = path.join(outputDir, "audio", `${article.slug}.mp3`);
    if (audio && fs.existsSync(audioFile)) {
      const enclosureUrl = `${base}/audio/${article.slug}.mp3`;
      const bytes = fs.statSync(audioFile).size;
      audioTags = `
      <enclosure url="${escapeXml(enclosureUrl)}" length="${bytes}" type="audio/mpeg" />
      <itunes:author>${escapeXml(authorName)}</itunes:author>
      <itunes:duration>${audio.seconds || audio.minutes * 60}</itunes:duration>`;
    }

    return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(articleUrl)}</link>
      <guid isPermaLink="true">${escapeXml(articleUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(article.summary || "")}</description>
      <author>${escapeXml(authorName)}</author>
${tags}${audioTags}
    </item>`;
  }).join("\n");

  const buildDate = new Date().toUTCString();
  const feedUrl = `${base}/feed.xml`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <generator>NostrPress</generator>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <itunes:author>${escapeXml(authorName)}</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${escapeXml(coverUrl)}" />
${items}
  </channel>
</rss>`;

  const feedPath = path.join(outputDir, "feed.xml");
  fs.writeFileSync(feedPath, xml, "utf-8");
  return feedPath;
}

function generateJsonFeed(context, outputDir) {
  const siteUrl = context.site.url;
  if (!siteUrl) return null;

  const { title, description } = context.site;
  const author = context.author.profile;
  const authorName = author.display_name || author.name || title;
  const articles = context.articles.slice(0, 10); // JSON Feed: latest 10

  const items = articles.map((article) => {
    const articleUrl = `${siteUrl}/${article.slug}.html`;
    const item = {
      id: articleUrl,
      url: articleUrl,
      title: article.title,
      date_published: new Date(article.published_at).toISOString(),
    };
    if (article.summary) item.summary = article.summary;
    // `html` is the sanitized rendered markdown (set before renderSite).
    if (article.html) item.content_html = article.html;
    else if (article.content) item.content_text = article.content;
    if (article.tags?.length) item.tags = article.tags;
    if (article.image) item.image = article.image;
    return item;
  });

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title,
    home_page_url: `${siteUrl}/`,
    feed_url: `${siteUrl}/feed.json`,
    description,
    authors: [{ name: authorName }],
    items,
  };

  const feedPath = path.join(outputDir, "feed.json");
  fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2), "utf-8");
  return feedPath;
}

// ── Sitemap Generation ────────────────────────────────────────────────────────

function generateSitemap(context, outputDir) {
  const siteUrl = context.site.url;
  if (!siteUrl) return null;

  const articles = context.articles;
  const now = new Date().toISOString().split("T")[0];

  const urls = [
    // Homepage
    `  <url>\n    <loc>${escapeXml(siteUrl)}/</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
  ];

  // Article pages
  for (const article of articles) {
    const articleUrl = `${siteUrl}/${article.slug}.html`;
    const lastmod = new Date(article.published_at).toISOString().split("T")[0];
    urls.push(`  <url>\n    <loc>${escapeXml(articleUrl)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
  }

  // Tag pages
  const seenTags = new Set();
  for (const article of articles) {
    for (const tag of article.tags || []) {
      const slug = normalizeTag(tag);
      if (!seenTags.has(slug)) {
        seenTags.add(slug);
        const tagUrl = `${siteUrl}/tags/${slug}/`;
        urls.push(`  <url>\n    <loc>${escapeXml(tagUrl)}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.5</priority>\n  </url>`);
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  const sitemapPath = path.join(outputDir, "sitemap.xml");
  fs.writeFileSync(sitemapPath, xml, "utf-8");
  return sitemapPath;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const config = loadConfig();
  if (!config.input.npub_or_nprofile) {
    console.error(`
  ✗ Error: Nostr public key (npub1...) or profile (nprofile1...) is required.

  Usage:
    npx github:besoeasy/NostrPress <npub_or_nprofile> [options]
    NPUB=npub1... npx github:besoeasy/NostrPress

  Run \`nostrpress --help\` for full list of options.
`);
    process.exit(1);
  }

  if (config.clean) {
    clearClientCache();
    clearMediaCache();
    const cacheDir = path.resolve(process.cwd(), "nostr-cache");
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  }

  const hasSiteUrl = Boolean(config.site.url);
  // Steps: identity, profile, articles, comments, media, audio, render+cards, assets+css, rss+sitemap (optional)
  const numSteps = (hasSiteUrl ? 8 : 7) + 2;
  initProgress(numSteps);

  console.log("\n  NostrPress — building your Nostr blog\n");

  // ── Step 1: Resolve identity ───────────────────────────────────────────────
  step("Resolving identity");
  const identity = resolveIdentity(config.input.npub_or_nprofile, config.relays);
  stepDone(`→ ${identity.npub.slice(0, 16)}…`);

  const pool = new SimplePool();
  pool.maxWaitForConnection = config?.timeouts?.network_ms || 10000;
  const authorRelays = await fetchUserRelays(pool, identity.relays, identity.pubkey);
  const activeRelays = Array.from(new Set([...identity.relays, ...authorRelays]));

  // ── Step 2: Fetch profile ──────────────────────────────────────────────────
  step("Fetching profile");
  const profile = await fetchProfileMetadata(pool, activeRelays, identity.pubkey);
  const displayName = profile.display_name || profile.name || identity.npub.slice(0, 12);
  stepDone(`→ ${displayName}`);

  // ── Step 3: Fetch articles ─────────────────────────────────────────────────
  step("Fetching articles");
  const events = await fetchArticles(pool, activeRelays, config, identity.pubkey);
  const parsed = events.map(parseArticle);
  const deduped = dedupeArticleTags(dedupeArticles(parsed));
  const sorted = sortArticles(deduped);
  const withSummary = sorted.map((article) => ({
    ...article,
    summary: normalizeSummary(article.content, article.summary),
  }));
  stepDone(`→ ${withSummary.length} article${withSummary.length !== 1 ? "s" : ""}`);

  // ── Step 4: Fetch comments ─────────────────────────────────────────────────
  step("Fetching comments");
  const articleEventIds = withSummary.map((a) => a.id);
  const commentsMap = await fetchComments(pool, activeRelays, articleEventIds);
  await pool.close(activeRelays);
  const totalComments = [...commentsMap.values()].reduce((acc, c) => acc + c.length, 0);
  stepDone(`→ ${totalComments} comment${totalComments !== 1 ? "s" : ""}`);

  const withComments = withSummary.map((article) => ({
    ...article,
    comments: commentsMap.get(article.id) || [],
  }));

  cleanOutput(config.output_dir);

  // ── Step 5: Download media ─────────────────────────────────────────────────
  step("Processing media");
  const mediaResult = await processMedia(withComments, config, profile);
  stepDone(`→ ${mediaResult.assets.length} asset${mediaResult.assets.length !== 1 ? "s" : ""}`);

  if (profile.picture && mediaResult.urlMap.has(profile.picture)) {
    profile.picture = mediaResult.urlMap.get(profile.picture);
  }
  if (profile.banner && mediaResult.urlMap.has(profile.banner)) {
    profile.banner = mediaResult.urlMap.get(profile.banner);
  }

  const rewritten = withComments.map((article) => rewriteArticleContent(article, mediaResult.urlMap));

  // ── Step 6: Audio narration ─────────────────────────────────────────────────
  // Generated before rendering so pages can embed players and durations.
  // Failure must not break the build — pages simply render without audio.
  step("Generating audio narration");
  let audioResult = null;
  try {
    audioResult = await generateAudio({
      context: buildContext(config, identity.npub, identity.pubkey, profile, rewritten),
      outputDir: config.output_dir,
      cacheDir: path.resolve(process.cwd(), "nostr-cache"),
    });
    // generateAudio mutates article.audioMinutes on the shared article objects.
    stepDone(`→ ${audioResult.count} story MP3${audioResult.count !== 1 ? "s" : ""} + whole-blog (${audioResult.wholeBlog?.minutes || "?"} min)`);
  } catch (err) {
    stepDone("→ skipped");
    console.warn(`  ⚠ Audio narration skipped — ${err.message}`);
  }

  // ── Step 7: Render HTML ────────────────────────────────────────────────────
  step("Rendering site");
  const rendered = rewritten.map((article) => ({
    ...article,
    readingTime: calculateReadingTime(article.content),
    html: renderMarkdown(article),
  }));
  const context = buildContext(config, identity.npub, identity.pubkey, profile, rendered);
  if (audioResult && audioResult.wholeBlog) {
    context.audio = { wholeBlog: audioResult.wholeBlog };
  }

  // Social cards are generated from titles + metadata and referenced by every
  // page's og:image/twitter:image — failure must not break the build.
  step("Generating social cards");
  let socialCardsEnabled = false;
  try {
    const cards = await generateSocialCards({
      context,
      outputDir: config.output_dir,
      cacheDir: path.resolve(process.cwd(), "nostr-cache", "fonts"),
    });
    socialCardsEnabled = cards.socialCards;
    stepDone(`→ ${cards.count} social card${cards.count !== 1 ? "s" : ""}`);
  } catch (err) {
    stepDone("→ skipped");
    console.warn(`  ⚠ Social cards skipped — ${err.message}`);
  }

  renderSite(context, config.output_dir, { socialCards: socialCardsEnabled });
  stepDone(`→ ${rendered.length} page${rendered.length !== 1 ? "s" : ""}`);

  // ── Step 7: Static assets + CSS ───────────────────────────────────────────
  step("Building CSS & static assets");
  writeStaticAssets(config.output_dir, packageRoot);
  runTailwind(config.output_dir, packageRoot);

  // ── Step 8: RSS + JSON Feed + Sitemap (only when SITE_URL is set) ─────────
  let rssPath = null;
  let jsonFeedPath = null;
  let sitemapPath = null;

  if (hasSiteUrl) {
    step("Generating RSS + JSON feeds & sitemap");
    rssPath = generateRss(context, config.output_dir, audioResult?.items ?? []);
    jsonFeedPath = generateJsonFeed(context, config.output_dir);
    sitemapPath = generateSitemap(context, config.output_dir);
    stepDone(`→ feed.xml + feed.json + sitemap.xml`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  printSummary({
    articles: rendered.length,
    assets: mediaResult.assets.length,
    audio: audioResult,
    rss: rssPath ? path.join(config.output_dir, "feed.xml") : null,
    jsonFeed: jsonFeedPath ? path.join(config.output_dir, "feed.json") : null,
    sitemap: sitemapPath ? path.join(config.output_dir, "sitemap.xml") : null,
    outputDir: path.resolve(config.output_dir),
  });

  process.exit(0);
}

run().catch((error) => {
  console.error("\n  ✗ Build failed:", error.message);
  process.exit(1);
});
