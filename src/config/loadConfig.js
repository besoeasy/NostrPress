import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "./defaults.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pkgPath = path.join(packageRoot, "package.json");

function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

export function printHelp() {
  const v = getVersion();
  console.log(`
  NostrPress v${v} — Turn your Nostr articles into a fast static blog

  Usage:
    nostrpress <npub_or_nprofile> [options]
    NPUB=npub1... nostrpress [options]

  Arguments:
    <npub_or_nprofile>       Nostr public key (npub1...) or profile (nprofile1...)

  Options:
    -n, --npub <key>         Nostr public key (npub1...) or profile (nprofile1...)
    -o, --out <dir>          Output directory (default: "./blog")
    -u, --url <url>          Base canonical URL for RSS & sitemap (e.g. "https://myblog.com")
        --site-url <url>     Alias for --url
    -r, --relay <relay>      Custom Nostr relay URL (can be specified multiple times)
        --relays <relays>    Comma-separated list of custom Nostr relays
    -c, --clean              Clear local cache before building
        --no-media           Skip downloading media assets
    -h, --help               Display this help message
    -v, --version            Display version number

  Examples:
    npx nostrpress npub1hznmntyj254kqhr079a5gt2wvhyll6rz6q67pyjres4lfkql22kq5ml6zh
    npx nostrpress npub1... --out ./public/blog --url https://myblog.com
    npx nostrpress npub1... -r wss://relay.primal.net -r wss://relay.snort.social
    NPUB=npub1... npx nostrpress
`);
}

export function loadConfig(argv = process.argv.slice(2)) {
  let values = {};
  let positionals = [];

  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        npub: { type: "string", short: "n" },
        out: { type: "string", short: "o" },
        output: { type: "string" },
        url: { type: "string", short: "u" },
        "site-url": { type: "string" },
        relay: { type: "string", short: "r", multiple: true },
        relays: { type: "string" },
        clean: { type: "boolean", short: "c", default: false },
        "no-media": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false }
      },
      allowPositionals: true,
      strict: false
    });
    values = parsed.values || {};
    positionals = parsed.positionals || [];
  } catch {
    // If parseArgs throws on unexpected tokens, fallback
  }

  if (values.version) {
    console.log(`nostrpress v${getVersion()}`);
    process.exit(0);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const positionalNpub = positionals.find((p) => p.startsWith("npub") || p.startsWith("nprofile")) || positionals[0];
  const npub = values.npub || positionalNpub || process.env.NPUB || "";
  const outDir = values.out || values.output || process.env.OUTPUT_DIR || defaultConfig.output_dir;
  const rawUrl = values.url || values["site-url"] || process.env.SITE_URL || "";
  const siteUrl = rawUrl.replace(/\/$/, "");

  let relays = [...defaultConfig.relays];
  const customRelayList = [];
  if (values.relay) {
    customRelayList.push(...(Array.isArray(values.relay) ? values.relay : [values.relay]));
  }
  if (values.relays) {
    customRelayList.push(...values.relays.split(","));
  }
  if (process.env.RELAYS) {
    customRelayList.push(...process.env.RELAYS.split(","));
  }
  if (customRelayList.length > 0) {
    const cleaned = customRelayList.map((r) => r.trim()).filter(Boolean);
    relays = Array.from(new Set([...cleaned, ...defaultConfig.relays]));
  }

  const cleanCache = Boolean(values.clean || process.env.CLEAN);
  const downloadMedia = values["no-media"] ? false : defaultConfig.media.download;

  return {
    ...defaultConfig,
    input: {
      npub_or_nprofile: npub
    },
    relays,
    output_dir: outDir,
    clean: cleanCache,
    site: {
      ...defaultConfig.site,
      url: siteUrl
    },
    media: {
      ...defaultConfig.media,
      download: downloadMedia
    }
  };
}
