export type RelayUrl = string;

export interface Config {
  input: {
    npub_or_nprofile: string;
  };
  relays: RelayUrl[];
  trusted_only: boolean;
  output_dir: string;
  site: {
    title: string | "auto";
    description: string | "auto";
    base_url: string;
  };
  media: {
    download: boolean;
    max_size_mb: number;
    allowed_mime: string[];
    dedupe: boolean;
  };
  fetch: {
    since?: number;
    until?: number;
    include_kind1: boolean;
  };
  timeouts: {
    network_ms: number;
  };
}

export interface ProfileMetadata {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  website?: string;
  lud16?: string; // Lightning address
  twitter?: string;
  github?: string;
  telegram?: string;
}

export interface Comment {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  author_name?: string;
  author_picture?: string;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  html: string;
  published_at: number;
  modified_at?: number;
  tags: string[];
  image?: string;
  imeta_urls: string[];
  naddr?: string; // NIP-19 address
  comments: Comment[];
  readingTime?: number; // in minutes
  excerpt?: string; // SEO-friendly excerpt
  wordCount?: number;
}

export interface RenderContext {
  site: {
    title: string;
    description: string;
    base_url: string;
  };
  author: {
    npub: string;
    pubkey: string;
    profile: ProfileMetadata;
  };
  articles: Article[];
}

export interface MediaAsset {
  url: string;
  localPath: string;
  mime: string;
}
