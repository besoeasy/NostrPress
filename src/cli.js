import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SimplePool } from "nostr-tools";
import { loadConfig } from "./config/loadConfig.js";
import { resolveIdentity, fetchProfileMetadata, fetchArticles, fetchComments } from "./nostr/client.js";
import { parseArticle } from "./parser/articleParser.js";
import { processMedia, rewriteArticleContent } from "./media/mediaPipeline.js";
import { renderMarkdown, renderSite } from "./render/render.js";
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
  if (stats.sitemap) console.log(`  ✓ Sitemap   → ${stats.sitemap}`);
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

function generateRss(context, outputDir) {
  const siteUrl = context.site.url;
  if (!siteUrl) return null;

  const { title, description } = context.site;
  const author = context.author.profile;
  const authorName = author.display_name || author.name || title;
  const articles = context.articles.slice(0, 20); // RSS: latest 20

  const items = articles.map((article) => {
    const articleUrl = `${siteUrl}/${article.slug}.html`;
    const pubDate = new Date(article.published_at).toUTCString();
    const tags = (article.tags || []).map((t) => `      <category>${escapeXml(t)}</category>`).join("\n");

    return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(articleUrl)}</link>
      <guid isPermaLink="true">${escapeXml(articleUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(article.summary || "")}</description>
      <author>${escapeXml(authorName)}</author>
${tags}
    </item>`;
  }).join("\n");

  const buildDate = new Date().toUTCString();
  const feedUrl = `${siteUrl}/feed.xml`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <generator>NostrPress</generator>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  const feedPath = path.join(outputDir, "feed.xml");
  fs.writeFileSync(feedPath, xml, "utf-8");
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
    throw new Error("NPUB environment variable is required");
  }

  const hasSiteUrl = Boolean(config.site.url);
  // Steps: identity, profile, articles, comments, media, render, assets+css, rss+sitemap (optional)
  const numSteps = hasSiteUrl ? 8 : 7;
  initProgress(numSteps);

  console.log("\n  NostrPress — building your Nostr blog\n");

  // ── Step 1: Resolve identity ───────────────────────────────────────────────
  step("Resolving identity");
  const identity = resolveIdentity(config.input.npub_or_nprofile, config.relays);
  stepDone(`→ ${identity.npub.slice(0, 16)}…`);

  const pool = new SimplePool();

  // ── Step 2: Fetch profile ──────────────────────────────────────────────────
  step("Fetching profile");
  const profile = await fetchProfileMetadata(pool, identity.relays, identity.pubkey);
  const displayName = profile.display_name || profile.name || identity.npub.slice(0, 12);
  stepDone(`→ ${displayName}`);

  // ── Step 3: Fetch articles ─────────────────────────────────────────────────
  step("Fetching articles");
  const events = await fetchArticles(pool, config, identity.pubkey);
  const parsed = events.map(parseArticle);
  const sorted = sortArticles(parsed);
  const withSummary = sorted.map((article) => ({
    ...article,
    summary: normalizeSummary(article.content, article.summary),
  }));
  stepDone(`→ ${withSummary.length} article${withSummary.length !== 1 ? "s" : ""}`);

  // ── Step 4: Fetch comments ─────────────────────────────────────────────────
  step("Fetching comments");
  const articleEventIds = withSummary.map((a) => a.id);
  const commentsMap = await fetchComments(pool, identity.relays, articleEventIds);
  await pool.close(identity.relays);
  const totalComments = [...commentsMap.values()].reduce((acc, c) => acc + c.length, 0);
  stepDone(`→ ${totalComments} comment${totalComments !== 1 ? "s" : ""}`);

  const withComments = withSummary.map((article) => ({
    ...article,
    comments: commentsMap.get(article.id) || [],
  }));

  cleanOutput(config.output_dir);

  // ── Step 5: Download media ─────────────────────────────────────────────────
  step("Processing media");
  const mediaResult = await processMedia(withComments, config);
  stepDone(`→ ${mediaResult.assets.length} asset${mediaResult.assets.length !== 1 ? "s" : ""}`);

  const rewritten = withComments.map((article) => rewriteArticleContent(article, mediaResult.urlMap));

  // ── Step 6: Render HTML ────────────────────────────────────────────────────
  step("Rendering site");
  const rendered = rewritten.map((article) => ({
    ...article,
    html: renderMarkdown(article),
  }));
  const context = buildContext(config, identity.npub, identity.pubkey, profile, rendered);
  renderSite(context, config.output_dir);
  stepDone(`→ ${rendered.length} page${rendered.length !== 1 ? "s" : ""}`);

  // ── Step 7: Static assets + CSS ───────────────────────────────────────────
  step("Building CSS & static assets");
  writeStaticAssets(config.output_dir, packageRoot);
  runTailwind(config.output_dir, packageRoot);

  // ── Step 8: RSS + Sitemap (only when SITE_URL is set) ─────────────────────
  let rssPath = null;
  let sitemapPath = null;

  if (hasSiteUrl) {
    step("Generating RSS feed & sitemap");
    rssPath = generateRss(context, config.output_dir);
    sitemapPath = generateSitemap(context, config.output_dir);
    stepDone(`→ feed.xml + sitemap.xml`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  printSummary({
    articles: rendered.length,
    assets: mediaResult.assets.length,
    rss: rssPath ? path.join(config.output_dir, "feed.xml") : null,
    sitemap: sitemapPath ? path.join(config.output_dir, "sitemap.xml") : null,
    outputDir: path.resolve(config.output_dir),
  });

  process.exit(0);
}

run().catch((error) => {
  console.error("\n  ✗ Build failed:", error.message);
  process.exit(1);
});
