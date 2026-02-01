import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { extension as mimeExtension } from "mime-types";
import { Article, Config, MediaAsset } from "../types.js";
import { discoverMediaUrls } from "./mediaScan.js";
import { CacheManager } from "../cache/cacheManager.js";

const mediaCache = new CacheManager("cache/media-map.json", 24 * 365); // Long cache for media (1 year)

interface MediaResult {
  assets: MediaAsset[];
  urlMap: Map<string, string>;
}

function matchMime(allowed: string[], mime: string): boolean {
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

function getTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  (controller.signal as any).timeoutId = timeout;
  return controller.signal;
}

function clearTimeoutSignal(signal: AbortSignal) {
  const timeoutId = (signal as any).timeoutId as NodeJS.Timeout | undefined;
  if (timeoutId) clearTimeout(timeoutId);
}

async function headRequest(url: string, timeoutMs: number): Promise<{ mime?: string; length?: number }> {
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

async function download(url: string, timeoutMs: number, maxBytes: number): Promise<{ buffer: Buffer; mime?: string }> {
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

function computeHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function resolveAssetPath(mime: string, hash: string, outputDir: string): { localPath: string; publicPath: string } {
  const ext = mimeExtension(mime) || "bin";
  const isVideo = mime.startsWith("video/");
  const folder = isVideo ? "videos" : "images";
  const fileName = `${hash}.${ext}`;
  const localPath = path.join(outputDir, "assets", folder, fileName);
  const publicPath = `/assets/${folder}/${fileName}`;
  return { localPath, publicPath };
}

export async function processMedia(articles: Article[], config: Config): Promise<MediaResult> {
  if (!config.media.download) {
    return { assets: [], urlMap: new Map() };
  }

  const urlMap = new Map<string, string>();
  const assets: MediaAsset[] = [];
  const seenHashes = new Set<string>();

  const allUrls = new Set<string>();
  for (const article of articles) {
    for (const url of discoverMediaUrls(article)) {
      allUrls.add(url);
    }
  }

  const maxBytes = config.media.max_size_mb * 1024 * 1024;

  for (const url of allUrls) {
    try {
      // Check cache first
      const cached = mediaCache.get<{ hash: string; mime: string }>(url);
      if (cached) {
        const { localPath, publicPath } = resolveAssetPath(cached.mime, cached.hash, config.output_dir);
        if (fs.existsSync(localPath)) {
            urlMap.set(url, publicPath);
            if (!seenHashes.has(cached.hash)) {
                assets.push({ url, localPath: publicPath, mime: cached.mime });
                seenHashes.add(cached.hash);
            }
            continue; // Skip download
        }
      }

      const head = await headRequest(url, config.timeouts.network_ms);
      if (head.length && head.length > maxBytes) continue;
      const mime = head.mime || "";
      if (mime && !matchMime(config.media.allowed_mime, mime)) continue;

      const { buffer, mime: downloadedMime } = await download(url, config.timeouts.network_ms, maxBytes);
      const finalMime = downloadedMime || mime || "application/octet-stream";
      if (!matchMime(config.media.allowed_mime, finalMime)) continue;

      const hash = computeHash(buffer);
      
      // Cache the result
      mediaCache.set(url, { hash, mime: finalMime });

      if (config.media.dedupe && seenHashes.has(hash)) {
        const { publicPath } = resolveAssetPath(finalMime, hash, config.output_dir);
        urlMap.set(url, publicPath);
        continue;
      }

      const { localPath, publicPath } = resolveAssetPath(finalMime, hash, config.output_dir);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      if (!fs.existsSync(localPath)) {
        fs.writeFileSync(localPath, buffer);
      }
      assets.push({ url, localPath: publicPath, mime: finalMime });
      urlMap.set(url, publicPath);
      seenHashes.add(hash);
    } catch {
      continue;
    }
  }

  return { assets, urlMap };
}

export function rewriteArticleContent(article: Article, urlMap: Map<string, string>): Article {
  let content = article.content;
  for (const [original, replacement] of urlMap) {
    content = content.split(original).join(replacement);
  }
  const image = article.image && urlMap.has(article.image) ? urlMap.get(article.image) : article.image;
  return { ...article, content, image: image || undefined };
}
