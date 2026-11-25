import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import nunjucks from "nunjucks";
import hljs from "highlight.js";
import { slugify, normalizeTag } from "../utils/slugify.js";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code class="hljs language-${lang}">${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
      } catch (__) {}
    }
    try {
      return `<pre class="hljs"><code class="hljs">${hljs.highlightAuto(str).value}</code></pre>`;
    } catch (__) {}
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  }
});

const sanitizer = (html) =>
  sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "span",
      "details",
      "summary",
      "figure",
      "figcaption",
      "picture",
      "source"
    ]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "loading", "srcset", "sizes", "width", "height"],
      source: ["src", "srcset", "type", "media", "sizes"],
      code: ["class"],
      pre: ["class"],
      span: ["class"],
      details: ["open"],
      '*': ["class", "id"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard"
  });

export function calculateReadingTime(text) {
  const wordsPerMinute = 200;
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

export function generateExcerpt(content, maxLength = 160) {
  const plainText = content.replace(/[#*`\[\]]/g, '').trim();
  if (plainText.length <= maxLength) return plainText;
  return plainText.substring(0, maxLength).trim() + '...';
}

export function findRelatedArticles(current, allArticles, limit = 3) {
  const scored = allArticles
    .filter(a => a.id !== current.id)
    .map(article => {
      let score = 0;
      const commonTags = article.tags.filter(t => current.tags.includes(t));
      score += commonTags.length * 10;
      const daysDiff = Math.abs(article.published_at - current.published_at) / (60 * 60 * 24);
      if (daysDiff < 30) score += 5;
      return { article, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.article);
}

function slugifyHeading(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z0-9#]+;/gi, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function renderMarkdown(article) {
  const toc = [];
  const usedIds = new Map();
  const originalHeadingOpen =
    md.renderer.rules.heading_open ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const level = Number(token.tag.slice(1));
    if (level >= 2 && level <= 3) {
      const inline = tokens[idx + 1];
      const text = (inline?.children || [])
        .filter((t) => ["text", "code_inline", "image"].includes(t.type))
        .map((t) => (t.type === "image" ? t.content || t.attrGet("alt") || "" : t.content))
        .join("")
        .trim();
      const base = slugifyHeading(text) || `section-${toc.length + 1}`;
      const count = usedIds.get(base) || 0;
      usedIds.set(base, count + 1);
      const id = count ? `${base}-${count}` : base;
      token.attrSet("id", id);
      toc.push({ level, text, id });
    }
    return originalHeadingOpen(tokens, idx, options, env, self);
  };

  try {
    const raw = md.render(article.content);
    article.toc = toc;
    return sanitizer(raw);
  } finally {
    md.renderer.rules.heading_open = originalHeadingOpen;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(target, content) {
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);
}

export function createRenderer(templateDir) {
  const env = nunjucks.configure(templateDir, { autoescape: true });
  env.addFilter("date", (value, format) => {
    const raw = typeof value === "number" && value > 0 && value < 1e12 ? value * 1000 : value;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    if (format === "Y-m-d") {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    if (format === "human") {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
    }
    if (format === "short") {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
    }
    if (format === "iso") {
      return date.toISOString();
    }
    return date.toISOString();
  });
  // Take the first `n` items of an array (Nunjucks' built-in `slice` splits
  // into groups, so `| slice(0, n)` silently yields nothing).
  env.addFilter("take", (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []));
  // Prefix locally-downloaded asset paths with the page-depth prefix so they
  // resolve from nested pages too (tag pages live at tags/<slug>/).
  env.addFilter("depth", (url, prefix) => {
    if (!url) return url;
    if (/^(https?:)?\/\//i.test(url) || url.startsWith("/")) return url;
    return prefix + url;
  });
  return env;
}

export function renderSite(context, outputDir, { socialCards = false } = {}) {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const templatesDir = path.join(packageRoot, "src/render/templates");
  const env = createRenderer(templatesDir);

  // og:image paths resolve against SITE_URL when set, else the page-depth prefix
  const siteBase = context.site.url ? `${context.site.url.replace(/\/+$/, "")}/` : null;
  const ogBaseFor = (prefix) => siteBase || prefix;

  const articlesSorted = [...context.articles].sort((a, b) => b.published_at - a.published_at);

  // Enrich articles with reading time, excerpts, and related articles
  for (const article of articlesSorted) {
    article.readingTime = calculateReadingTime(article.content);
    article.excerpt = article.summary || generateExcerpt(article.content);
    article.wordCount = article.content.trim().split(/\s+/).length;
  }

  const tagMap = new Map();
  for (const article of articlesSorted) {
    article.tagSlugs = article.tags.map(normalizeTag);
    article.tagSlugMap = Object.fromEntries(
      article.tags.map((tag, index) => [tag, article.tagSlugs[index]])
    );
    for (const tagIndex of article.tags.keys()) {
      const tagSlug = article.tagSlugs[tagIndex];
      // Guard against tag variants ("Debian"/"debian") collapsing to the same
      // slug — an article should appear only once per tag page.
      const tagArticles = tagMap.has(tagSlug)
        ? tagMap.get(tagSlug).articles
        : tagMap.set(tagSlug, { name: article.tags[tagIndex], slug: tagSlug, articles: [] }).get(tagSlug).articles;
      if (tagArticles[tagArticles.length - 1] !== article) {
        tagArticles.push(article);
      }
    }
  }

  const topics = [];
  for (const { name, slug, articles } of tagMap.values()) {
    topics.push({ name, slug, count: articles.length });
  }
  topics.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const indexHtml = env.render("index.njk", { ...context, articles: articlesSorted, topics, pathPrefix: "./", ogBase: ogBaseFor("./"), socialCards });
  writeFile(path.join(outputDir, "index.html"), indexHtml);

  for (let i = 0; i < articlesSorted.length; i++) {
    const article = articlesSorted[i];
    const relatedArticles = findRelatedArticles(article, articlesSorted);
    const newerArticle = i > 0 ? articlesSorted[i - 1] : null;
    const olderArticle = i < articlesSorted.length - 1 ? articlesSorted[i + 1] : null;
    const articleHtml = env.render("article.njk", {
      ...context,
      article,
      relatedArticles,
      newerArticle,
      olderArticle,
      pathPrefix: "./",
      ogBase: ogBaseFor("./"),
      socialCards,
    });
    writeFile(path.join(outputDir, `${article.slug}.html`), articleHtml);
  }

  for (const { name, slug, articles } of tagMap.values()) {
    const tagHtml = env.render("tag.njk", { ...context, tag: name, tagSlug: slug, articles, pathPrefix: "../../", ogBase: ogBaseFor("../../"), socialCards });
    writeFile(path.join(outputDir, "tags", slug, "index.html"), tagHtml);
  }

  const topicsHtml = env.render("topics.njk", { ...context, topics, pathPrefix: "../", ogBase: ogBaseFor("../"), socialCards });
  writeFile(path.join(outputDir, "topics", "index.html"), topicsHtml);

  const archiveMap = new Map();
  for (const article of articlesSorted) {
    const year = new Date(article.published_at).getUTCFullYear();
    if (!archiveMap.has(year)) archiveMap.set(year, []);
    archiveMap.get(year).push(article);
  }
  const archive = Array.from(archiveMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({ year, articles: items }));
  const archiveHtml = env.render("archive.njk", { ...context, articles: articlesSorted, archive, pathPrefix: "../", ogBase: ogBaseFor("../"), socialCards });
  writeFile(path.join(outputDir, "archive", "index.html"), archiveHtml);
}
