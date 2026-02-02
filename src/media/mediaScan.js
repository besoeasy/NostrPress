export function discoverMediaUrls(article) {
  const markdownImageRegex = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
  const plainUrlRegex = /(https?:\/\/[^\s)\]]+)/g;
  const urls = new Set();

  for (const match of article.content.matchAll(markdownImageRegex)) {
    urls.add(match[1]);
  }

  for (const match of article.content.matchAll(plainUrlRegex)) {
    urls.add(match[1]);
  }

  if (article.image) {
    urls.add(article.image);
  }

  for (const url of article.imeta_urls) {
    urls.add(url);
  }

  return Array.from(urls);
}
