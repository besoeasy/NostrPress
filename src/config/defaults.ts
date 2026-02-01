import { Config } from "../types.js";

export const defaultConfig: Config = {
  input: {
    npub_or_nprofile: ""
  },
  relays: ["wss://relay.damus.io", "wss://nos.lol"],
  trusted_only: true,
  output_dir: "./dist",
  site: {
    title: "auto",
    description: "auto",
    base_url: ""
  },
  media: {
    download: true,
    max_size_mb: 20,
    allowed_mime: ["image/*", "video/mp4"],
    dedupe: true
  },
  fetch: {
    include_kind1: false
  },
  timeouts: {
    network_ms: 15000
  }
};
