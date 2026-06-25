import { defaultConfig } from "./defaults.js";

export function loadConfig() {
  const npub = process.env.NPUB || "";

  return {
    ...defaultConfig,
    input: {
      npub_or_nprofile: npub
    },
    relays: defaultConfig.relays,
    output_dir: defaultConfig.output_dir,
    site: {
      ...defaultConfig.site
    },
    media: {
      ...defaultConfig.media
    }
  };
}
