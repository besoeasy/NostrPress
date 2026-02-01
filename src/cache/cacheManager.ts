import fs from "node:fs";
import path from "node:path";

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

interface CacheStore {
  [key: string]: CacheEntry<any>;
}

export class CacheManager {
  private cacheFile: string;
  private cache: CacheStore = {};
  private ttl: number;

  constructor(filePath: string = "nostr-cache/data.json", ttlHours: number = 1) {
    this.cacheFile = path.resolve(process.cwd(), filePath);
    this.ttl = ttlHours * 60 * 60 * 1000;
    this.ensureCacheDir();
    this.load();
  }

  private ensureCacheDir() {
    const dir = path.dirname(this.cacheFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load() {
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

  private save() {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2), "utf-8");
    } catch (error) {
      console.warn("Failed to save cache.", error);
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache[key];
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
        // Expired
        return null; 
    }
    
    return entry.data as T;
  }

  set<T>(key: string, data: T) {
    this.cache[key] = {
      timestamp: Date.now(),
      data,
    };
    this.save();
  }
}
