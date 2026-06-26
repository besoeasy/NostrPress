import slugifyLib from "slugify";

/**
 * Slugify a string using lowercase + strict mode.
 * Falls back to URI-encoding for strings that produce an empty slug.
 *
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  const slug = slugifyLib(text, { lower: true, strict: true });
  return slug || encodeURIComponent(String(text).toLowerCase());
}

/**
 * Normalise a tag into a URL-safe slug.
 *
 * @param {string} tag
 * @returns {string}
 */
export function normalizeTag(tag) {
  return slugify(String(tag));
}
