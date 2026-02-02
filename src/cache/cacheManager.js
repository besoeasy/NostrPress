import fs from "node:fs";
import path from "node:path";

export class CacheManager {
  constructor(filePath = "nostr-cache/data.json", ttlHours = 1) {
    this.cacheFile = path.resolve(process.cwd(), filePath);
    this.cache = {};
    this.ttl = ttlHours * 60 * 60 * 1000;
    this.ensureCacheDir();
    this.load();
  }

  ensureCacheDir() {
    const dir = path.dirname(this.cacheFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load() {
    if (fs.existsSync(this.cacheFile)) {
      try {
        const content = fs.readFileSync(this.cacheFile, "utf-8");
        this.cache = JSON.parse(content);
      } catch (error) {
        console.warn("Failed to load cache, starting fresh.", error);
        this.cache = {};
      }
    }
  }

  save() {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2), "utf-8");
    } catch (error) {
      console.warn("Failed to save cache.", error);
    }
  }

  get(key) {
    const entry = this.cache[key];
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
        // Expired
        return null; 
    }
    
    return entry.data;
  }

  set(key, data) {
    this.cache[key] = {
      timestamp: Date.now(),
      data,
    };
    this.save();
  }
}
