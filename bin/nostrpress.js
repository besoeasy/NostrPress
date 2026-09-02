#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Import and run the CLI
const cliPath = path.resolve(__dirname, "..", "src", "cli.js");
await import(cliPath);
