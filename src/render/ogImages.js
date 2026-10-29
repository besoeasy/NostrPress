import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

// ─────────────────────────────────────────────────────────────────────────────
// Static social-card generation (1200x630 PNG) in the site's Geist style.
// One card per page, rendered from title + metadata at build time — no browser,
// no runtime image service. Fonts are fetched once and cached in nostr-cache.
// ─────────────────────────────────────────────────────────────────────────────

const W = 1200;
const H = 630;

const FONT_SOURCES = [
  ["inter-400-normal.ttf", "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf"],
  ["inter-500-normal.ttf", "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.ttf"],
  ["inter-600-normal.ttf", "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf"],
  ["inter-700-normal.ttf", "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf"],
  ["jetbrains-mono-500-normal.ttf", "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-500-normal.ttf"],
];

const MIME_BY_EXT = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

// Rasterisation has no colour-emoji font, so strip pictographs that would
// otherwise render as tofu boxes in card text.
function sanitizeCardText(text) {
  return String(text)
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

/** Greedy word wrap on an estimated glyph width (Inter's average is ~0.52em; we stay conservative). */
function wrapText(text, maxWidth, fontSize, weightFactor = 0.52, maxLines = 3) {
  const charWidth = fontSize * weightFactor;
  const maxChars = Math.max(8, Math.floor(maxWidth / charWidth));
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = "";
  let consumed = 0;
  for (const word of words) {
    consumed += word.length + (line ? 1 : 0);
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      consumed = word.length;
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  // Truncated: append an ellipsis to the last emitted line.
  if (lines.length === maxLines && consumed < words.reduce((n, w) => n + w.length + 1, 0) - 1) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`;
  }
  return lines;
}

/** Pick the largest type size that keeps the title to two unwrapped lines. */
function fitTitle(text, width) {
  for (const size of [100, 88, 76, 64]) {
    const lines = wrapText(text, width, size, 0.52);
    if (lines.length <= 2 && !lines.some((line) => line.endsWith("…"))) {
      return { size, lines };
    }
  }
  return { size: 54, lines: wrapText(text, width, 54) };
}

async function loadFontFiles(cacheDir) {
  const files = [];
  for (const [fileName, url] of FONT_SOURCES) {
    const cached = path.join(cacheDir, fileName);
    if (fs.existsSync(cached)) {
      files.push(cached);
      continue;
    }
    const res = await fetch(url, { headers: { "user-agent": "NostrPress/0.3" } });
    if (!res.ok) throw new Error(`Font fetch failed (${res.status}) for ${fileName}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length < 10_000) throw new Error(`Font fetch returned ${body.length} bytes for ${fileName}`);
    fs.mkdirSync(cacheDir, { recursive: true });
    const tmp = `${cached}.tmp`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, cached);
    files.push(cached);
  }
  return files;
}

function avatarDataUri(outputDir, profilePicture) {
  if (!profilePicture) return null;
  const abs = path.resolve(outputDir, profilePicture);
  if (!fs.existsSync(abs)) return null;
  const mime = MIME_BY_EXT[path.extname(abs).toLowerCase()] || "image/jpeg";
  try {
    const buf = fs.readFileSync(abs);
    if (buf.length === 0) return null;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Render one 1200x630 card as SVG markup in Vercel's OG style:
 * square graph grid + masked corner ray fan, status-dot kicker, giant
 * near-black title with brand dot, edge-to-edge hairline above a footer with
 * inline avatar, name and single-baseline metadata.
 *
 * @param {{
 *   kicker?: string, kickerAccent?: boolean, siteLabel?: string,
 *   title: string,
 *   subtitle?: string,
 *   name: string, meta?: string, avatar?: string | null,
 * }} input
 */
function cardSvg(input) {
  // No emoji glyphs in the raster font set — strip pictographs up front
  input = {
    ...input,
    title: sanitizeCardText(input.title ?? ""),
    subtitle: input.subtitle ? sanitizeCardText(input.subtitle) : undefined,
    kicker: input.kicker ? sanitizeCardText(input.kicker) : undefined,
    siteLabel: input.siteLabel ? sanitizeCardText(input.siteLabel) : undefined,
    name: sanitizeCardText(input.name ?? ""),
    meta: input.meta ? sanitizeCardText(input.meta) : undefined,
  };
  const pad = 72;
  const textW = W - pad * 2;
  const parts = [];
  const ink = "#0a0a0a";
  const gray = "#71717a";
  const subtle = "#a9a9b2";
  const hairline = "#e5e5ea";
  const grid = "#ededf1";

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  );
  parts.push(`<defs>`);
  parts.push(
    `<radialGradient id="auroraA" cx="0.5" cy="0.5" r="0.5"><stop offset="0%" stop-color="#0070f3" stop-opacity="0.20"/><stop offset="100%" stop-color="#0070f3" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="auroraB" cx="0.5" cy="0.5" r="0.5"><stop offset="0%" stop-color="#7c5cff" stop-opacity="0.12"/><stop offset="100%" stop-color="#7c5cff" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="fanFade" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="55%" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`,
    `<mask id="fan"><rect width="${W}" height="${H}" fill="url(#fanFade)"/></mask>`
  );
  parts.push(`</defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="#fcfcfd"/>`);

  // Signature ray fan sweeping up from the bottom-left + soft aurora washes
  parts.push(`<g mask="url(#fan)" transform="rotate(-33 0 ${H})" stroke="#e2e4ec" stroke-width="1.1">`);
  for (let x = -560; x < W; x += 46) {
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="1500"/>`);
  }
  parts.push(`</g>`);
  parts.push(`<ellipse cx="1130" cy="40" rx="430" ry="330" fill="url(#auroraA)"/>`);
  parts.push(`<ellipse cx="120" cy="650" rx="380" ry="300" fill="url(#auroraB)"/>`);

  // Square graph-paper grid over the rays
  for (let x = pad; x < W; x += 44) {
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${grid}" stroke-width="1"/>`);
  }
  for (let y = pad; y < H; y += 44) {
    parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${grid}" stroke-width="1"/>`);
  }
  parts.push(`<rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" fill="none" stroke="${hairline}" stroke-width="1.5"/>`);

  // Kicker row: blue status dot + mono label left, site label right
  const hasKicker = Boolean(input.kicker);
  const kickerY = 132;
  if (hasKicker) {
    parts.push(`<circle cx="${pad + 5}" cy="${kickerY - 6}" r="5" fill="#0070f3"/>`);
    parts.push(
      `<text x="${pad + 20}" y="${kickerY}" font-family="JetBrains Mono" font-weight="500" font-size="18" letter-spacing="3.5" fill="${input.kickerAccent ? "#0070f3" : gray}">${escapeXml(input.kicker)}</text>`
    );
  }
  if (input.siteLabel) {
    parts.push(
      `<text x="${W - pad}" y="${kickerY}" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="17" letter-spacing="1.5" fill="${subtle}">${escapeXml(input.siteLabel)}</text>`
    );
  }

  // Title (auto-fit, ≤2 unwrapped lines) with the blue brand-dot on the last line
  const { size: titleSize, lines: titleLines } = fitTitle(input.title, textW);
  const titleLh = Math.round(titleSize * 1.14);
  const titleTop = Math.min(318, 520 - (titleLines.length - 1) * titleLh - 46);
  const truncated = /…$/.test(titleLines[titleLines.length - 1] || "");
  titleLines.forEach((line, index) => {
    const isLast = index === titleLines.length - 1;
    const dotMarkup = isLast && !truncated ? `<tspan fill="#0070f3">.</tspan>` : "";
    parts.push(
      `<text x="${pad}" y="${titleTop + index * titleLh}" font-family="Inter" font-weight="700" font-size="${titleSize}" letter-spacing="${-(titleSize * 0.042).toFixed(2)}" fill="${ink}">${escapeXml(line)}${dotMarkup}</text>`
    );
  });

  // Optional subtitle (site card description) right under the title
  if (input.subtitle) {
    const subtitleSize = 24;
    const subtitleTop = titleTop + titleLines.length * titleLh + 28;
    for (const [index, line] of wrapText(String(input.subtitle), textW, subtitleSize, 0.5, 2).entries()) {
      parts.push(
        `<text x="${pad}" y="${subtitleTop + index * 34}" font-family="Inter" font-weight="400" font-size="${subtitleSize}" letter-spacing="-0.4" fill="#6b6f76">${escapeXml(line)}</text>`
      );
    }
  }

  // Edge-to-edge hairline above the footer
  parts.push(`<line x1="0" y1="506" x2="${W}" y2="506" stroke="${hairline}" stroke-width="1"/>`);

  // Footer on a single baseline: avatar + name left, mono metadata right
  const footerCy = 568;
  if (input.avatar) {
    parts.push(
      `<clipPath id="ava"><circle cx="${pad + 22}" cy="${footerCy}" r="21"/></clipPath>`,
      `<image clip-path="url(#ava)" x="${pad + 1}" y="${footerCy - 22}" width="42" height="42" preserveAspectRatio="xMidYMid slice" href="${input.avatar}"/>`
    );
  } else {
    parts.push(
      `<circle cx="${pad + 22}" cy="${footerCy}" r="21" fill="#f4f4f6" stroke="${hairline}" stroke-width="1.5"/>`,
      `<text x="${pad + 22}" y="${footerCy + 7}" text-anchor="middle" font-family="Inter" font-weight="600" font-size="19" fill="${subtle}">${escapeXml((input.name || "?").charAt(0).toUpperCase())}</text>`
    );
  }
  parts.push(
    `<text x="${pad + 56}" y="${footerCy + 7}" font-family="Inter" font-weight="500" font-size="22" letter-spacing="-0.3" fill="#171717">${escapeXml(input.name)}</text>`
  );
  if (input.meta) {
    parts.push(
      `<text x="${W - pad}" y="${footerCy + 6}" text-anchor="end" font-family="JetBrains Mono" font-weight="500" font-size="17" fill="${gray}">${escapeXml(input.meta)}</text>`
    );
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

function rasterize(svg, fontFiles) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Inter" },
  });
  return Buffer.from(resvg.render().asPng());
}

/**
 * Generate the site card (og.png) and one card per article (og/{slug}.png).
 *
 * @returns {Promise<{ socialCards: boolean, count: number }>}
 */
export async function generateSocialCards({ context, outputDir, cacheDir }) {
  const { site, author, articles } = context;
  const profile = author.profile || {};
  const siteTitle = profile.display_name || profile.name || site.title;
  const dateLabel = (ts) => new Date(ts).toISOString().slice(0, 10);

  const fontFiles = await loadFontFiles(cacheDir);
  const avatar = avatarDataUri(outputDir, profile.picture);

  const cards = [
    {
      file: "og.png",
      svg: cardSvg({
        kicker: "BLOG · POWERED BY NOSTR",
        title: siteTitle,
        subtitle: site.description ? String(site.description).slice(0, 220) : undefined,
        name: siteTitle,
        meta: `${articles.length} stor${articles.length === 1 ? "y" : "ies"}`,
        avatar,
      }),
    },
  ];

  for (const article of articles) {
    cards.push({
      file: path.join("og", `${article.slug}.png`),
      svg: cardSvg({
        kicker: article.tags?.length ? `#${String(article.tags[0]).toUpperCase()}` : "STORY",
        kickerAccent: Boolean(article.tags?.length),
        siteLabel: site.title,
        title: article.title,
        name: siteTitle,
        meta: `${dateLabel(article.published_at)}${article.readingTime ? ` · ${article.readingTime} min read` : ""}`,
        avatar,
      }),
    });
  }

  for (const card of cards) {
    const abs = path.join(outputDir, card.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, rasterize(card.svg, fontFiles));
  }
  return { socialCards: true, count: cards.length };
}
