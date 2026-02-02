import { defaultConfig } from "./defaults.js";

export function loadConfig(cliBaseUrl) {
  const npub = process.env.NPUB || "";
  const relays = process.env.RELAYS ? process.env.RELAYS.split(",") : defaultConfig.relays;
  const outputDir = process.env.OUTPUT_DIR || defaultConfig.output_dir;
  
  // Auto-detect base URL from multiple sources with priority:
  // 1. CLI flag (--base-url)
  // 2. SITE_URL (Netlify/Vercel)
  // 3. PUBLIC_URL (some hosting providers)
  // 4. BASE_URL (optional .env)
  // 5. Dot (relative path for local browsing)
  const baseUrl = 
    cliBaseUrl || 
    process.env.SITE_URL || 
    process.env.PUBLIC_URL || 
    process.env.BASE_URL || 
    ".";
  
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
