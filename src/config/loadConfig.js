import { defaultConfig } from "./defaults.js";

export function loadConfig(cliBaseUrl) {
  const npub = process.env.NPUB || "";
  const relays = process.env.RELAYS ? process.env.RELAYS.split(",") : defaultConfig.relays;
  const outputDir = process.env.OUTPUT_DIR || defaultConfig.output_dir;
  
  // Auto-detect base URL from multiple sources with priority:
  // 1. CLI flag (--base-url)
  // 2. BASE_URL (user-defined)
  // 3. URL (Netlify)
  // 4. VERCEL_URL (Vercel)
  // 5. CF_PAGES_URL (Cloudflare Pages)
  // 6. Dot (relative path for local browsing)
  let baseUrl = 
    cliBaseUrl || 
    process.env.BASE_URL || 
    process.env.URL || 
    process.env.VERCEL_URL ||
    process.env.CF_PAGES_URL ||
    ".";
  
  // Vercel URL doesn't include protocol, add it
  if (baseUrl === process.env.VERCEL_URL && baseUrl !== ".") {
    baseUrl = `https://${baseUrl}`;
  }
  
  // Normalize base URL: remove trailing slash to avoid double slashes in URLs
  if (baseUrl !== "." && baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }
  
  const maxSizeMb = process.env.MAX_SIZE_MB ? Number(process.env.MAX_SIZE_MB) : defaultConfig.media.max_size_mb;

  return {
    ...defaultConfig,
    input: {
      npub_or_nprofile: npub
    },
    relays,
    output_dir: outputDir,
    site: {
      ...defaultConfig.site,
      base_url: baseUrl
    },
    media: {
      ...defaultConfig.media,
      max_size_mb: maxSizeMb
    }
  };
}
