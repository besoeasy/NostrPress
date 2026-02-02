import slugifyLib from "slugify";
import { nip19 } from "nostr-tools";

const slugify = slugifyLib;

function getTagValue(tags, name) {
  const tag = tags.find((t) => t[0] === name && t[1]);
  return tag?.[1];
}

function getAllTagValues(tags, name) {
  return tags.filter((t) => t[0] === name && t[1]).map((t) => t[1]);
}

function parseImetaUrls(tags) {
  const urls = [];
  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    for (const entry of tag.slice(1)) {
      if (entry.startsWith("url=")) {
        urls.push(entry.replace("url=", ""));
      } else if (entry.startsWith("https://") || entry.startsWith("http://")) {
        urls.push(entry);
      }
    }
  }
  return urls;
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

export function parseArticle(event) {
  const tags = event.tags;
  const title = getTagValue(tags, "title") || extractTitle(event.content) || "Untitled";
  const slugFromTag = getTagValue(tags, "d");
  const slug = slugFromTag || slugify(title, { lower: true, strict: true });
  const summary = getTagValue(tags, "summary") || "";
  const image = getTagValue(tags, "image");
  const publishedTag = getTagValue(tags, "published_at");
  const published_at = publishedTag ? Number(publishedTag) * 1000 : event.created_at * 1000;
  const tagsList = getAllTagValues(tags, "t");
  const imeta_urls = parseImetaUrls(tags);

  let naddr;
  if (slugFromTag && event.kind === 30023) {
    try {
      naddr = nip19.naddrEncode({
        identifier: slugFromTag,
        pubkey: event.pubkey,
        kind: 30023,
      });
    } catch (e) {
      console.warn("Failed to encode naddr", e);
    }
  }

  return {
    id: event.id,
    title,
    slug,
    naddr,
    summary,
    content: event.content,
    html: "",
    published_at,
    tags: tagsList,
    image,
    imeta_urls,
    comments: []
  };
}
