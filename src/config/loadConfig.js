import { defaultConfig } from "./defaults.js";

export function loadConfig() {
  const npub = process.env.NPUB || "";
  // Strip trailing slash so callers can always do `siteUrl + "/path"`
  const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");

  return {
    ...defaultConfig,
    input: {
      npub_or_nprofile: npub
    },
    relays: defaultConfig.relays,
    output_dir: defaultConfig.output_dir,
    site: {
      ...defaultConfig.site,
      url: siteUrl
    },
    media: {
      ...defaultConfig.media
    }
  };
}
