import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { extension as mimeExtension } from "mime-types";
import { discoverMediaUrls } from "./mediaScan.js";
import { CacheManager } from "../cache/cacheManager.js";

const mediaCache = new CacheManager("nostr-cache/media-map.json", 24 * 365); // Long cache for media (1 year)

const COMMON_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg"
]);

const COMMON_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "mp4",
  "webm",
  "mov",
  "mp3",
  "wav",
  "ogg"
]);

function matchMime(allowed, mime) {
  for (const pattern of allowed) {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.replace("/*", "");
      if (mime.startsWith(prefix + "/")) return true;
    } else if (pattern === mime) {
      return true;
    }
  }
  return false;
}

function getTimeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  controller.signal.timeoutId = timeout;
  return controller.signal;
}

function clearTimeoutSignal(signal) {
  const timeoutId = signal.timeoutId;
  if (timeoutId) clearTimeout(timeoutId);
}

async function headRequest(url, timeoutMs) {
  const signal = getTimeoutSignal(timeoutMs);
  try {
    const res = await fetch(url, { method: "HEAD", signal });
    if (!res.ok) {
      return {};
    }
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim();
    const length = res.headers.get("content-length") ? Number(res.headers.get("content-length")) : undefined;
    return { mime: mime || undefined, length };
  } finally {
    clearTimeoutSignal(signal);
  }
}

async function download(url, timeoutMs, maxBytes) {
  const signal = getTimeoutSignal(timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal });
    if (!res.ok) {
      throw new Error("Failed to download media");
    }
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim();
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > maxBytes) {
      throw new Error("Media exceeds max size");
    }
    return { buffer, mime: mime || undefined };
  } finally {
    clearTimeoutSignal(signal);
  }
}

function computeHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function resolveAssetPath(mime, hash, outputDir) {
  const ext = mimeExtension(mime) || "bin";
  const isVideo = mime.startsWith("video/");
  const folder = isVideo ? "videos" : "images";
  const fileName = `${hash}.${ext}`;
  const localPath = path.join(outputDir, "assets", folder, fileName);
  const publicPath = `/assets/${folder}/${fileName}`;
  return { localPath, publicPath };
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  const cleaned = rawUrl
    .replace(/&gt;$/g, "")
    .replace(/&lt;$/g, "")
    .replace(/[>),.]+$/g, "")
    .trim();
  try {
    const parsed = new URL(cleaned);
    return parsed.toString();
  } catch {
    return null;
  }
}

function isLikelyMediaUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    const ext = pathname.includes(".") ? pathname.split(".").pop() || "" : "";
    return COMMON_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

export async function processMedia(articles, config) {
  if (!config.media.download) {
    return { assets: [], urlMap: new Map() };
  }

  const urlMap = new Map();
  const assets = [];
  const seenHashes = new Set();

  // Ensure persistent cache directory exists
  const PERSISTENT_CACHE_DIR = path.resolve(process.cwd(), "nostr-cache", "media");
  fs.mkdirSync(PERSISTENT_CACHE_DIR, { recursive: true });

  const allUrls = new Set();
  for (const article of articles) {
    for (const url of discoverMediaUrls(article)) {
      const normalized = normalizeUrl(url);
      if (!normalized) continue;
      if (!isLikelyMediaUrl(normalized)) continue;
      allUrls.add(normalized);
    }
  }

  const maxBytes = config.media.max_size_mb * 1024 * 1024;

  for (const url of allUrls) {
    try {
      // Check cache map first
      const cached = mediaCache.get(url);
      
      if (cached) {
        const ext = mimeExtension(cached.mime) || "bin";
        const cacheFileName = `${cached.hash}.${ext}`;
        const cacheFilePath = path.join(PERSISTENT_CACHE_DIR, cacheFileName);

        // Required public/local paths for the build output
        const { localPath, publicPath } = resolveAssetPath(cached.mime, cached.hash, config.output_dir);

        // If defined in cache map AND file exists in persistent cache
        if (fs.existsSync(cacheFilePath)) {
            // Copy from persistent cache to build output if needed
            if (!fs.existsSync(localPath)) {
                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                fs.copyFileSync(cacheFilePath, localPath);
            }

            urlMap.set(url, publicPath);
            if (!seenHashes.has(cached.hash)) {
                assets.push({ url, localPath: publicPath, mime: cached.mime });
                seenHashes.add(cached.hash);
            }
            continue; // Used cached file
        }
      }

      // If not in cache or file missing, download
      const head = await headRequest(url, config.timeouts.network_ms);
      if (head.length && head.length > maxBytes) continue;
      const mime = head.mime || "";
      if (mime && !matchMime(config.media.allowed_mime, mime)) continue;

      const { buffer, mime: downloadedMime } = await download(url, config.timeouts.network_ms, maxBytes);
      const finalMime = downloadedMime || mime || "application/octet-stream";
      
      // Strict check: only process common media types
      if (!COMMON_MIME_TYPES.has(finalMime)) {
        continue;
      }

      if (!matchMime(config.media.allowed_mime, finalMime)) continue;

      const hash = computeHash(buffer);
      
      // Save to persistent cache
      const ext = mimeExtension(finalMime) || "bin";
      const cacheFileName = `${hash}.${ext}`;
      const cacheFilePath = path.join(PERSISTENT_CACHE_DIR, cacheFileName);
      fs.writeFileSync(cacheFilePath, buffer);

      // Update cache map
      mediaCache.set(url, { hash, mime: finalMime });

      const { localPath, publicPath } = resolveAssetPath(finalMime, hash, config.output_dir);
      
      // Save to output directory
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      if (!fs.existsSync(localPath)) {
        fs.copyFileSync(cacheFilePath, localPath); 
      }

      if (!seenHashes.has(hash) || !config.media.dedupe) {
        if (!config.media.dedupe || !seenHashes.has(hash)) {
            assets.push({ url, localPath: publicPath, mime: finalMime });
            seenHashes.add(hash);
        }
      }
      urlMap.set(url, publicPath);

    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`Skipping media ${url}: ${message}`);
      continue;
    }
  }

  return { assets, urlMap };
}

export function rewriteArticleContent(article, urlMap) {
  let content = article.content;
  for (const [original, replacement] of urlMap) {
    content = content.split(original).join(replacement);
  }
  const image = article.image && urlMap.has(article.image) ? urlMap.get(article.image) : article.image;
  return { ...article, content, image: image || undefined };
}
