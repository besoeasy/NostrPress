// Type definitions exported as JSDoc comments for documentation

/**
 * @typedef {string} RelayUrl
 */

/**
 * @typedef {Object} Config
 * @property {Object} input
 * @property {string} input.npub_or_nprofile
 * @property {RelayUrl[]} relays
 * @property {boolean} trusted_only
 * @property {string} output_dir
 * @property {Object} site
 * @property {string} site.title
 * @property {string} site.description
 * @property {string} site.base_url
 * @property {Object} media
 * @property {boolean} media.download
 * @property {number} media.max_size_mb
 * @property {string[]} media.allowed_mime
 * @property {boolean} media.dedupe
 * @property {Object} fetch
 * @property {number} [fetch.since]
 * @property {number} [fetch.until]
 * @property {boolean} fetch.include_kind1
 * @property {Object} timeouts
 * @property {number} timeouts.network_ms
 */

/**
 * @typedef {Object} ProfileMetadata
 * @property {string} [name]
 * @property {string} [display_name]
 * @property {string} [about]
 * @property {string} [picture]
 * @property {string} [banner]
 * @property {string} [nip05]
 * @property {string} [website]
 * @property {string} [lud16]
 * @property {string} [twitter]
 * @property {string} [github]
 * @property {string} [telegram]
 */

/**
 * @typedef {Object} Comment
 * @property {string} id
 * @property {string} pubkey
 * @property {string} content
 * @property {number} created_at
 * @property {string} [author_name]
 * @property {string} [author_picture]
 */

/**
 * @typedef {Object} Article
 * @property {string} id
 * @property {string} title
 * @property {string} slug
 * @property {string} summary
 * @property {string} content
 * @property {string} html
 * @property {number} published_at
 * @property {number} [modified_at]
 * @property {string[]} tags
 * @property {string} [image]
 * @property {string[]} imeta_urls
 * @property {string} [naddr]
 * @property {Comment[]} comments
 * @property {number} [readingTime]
 * @property {string} [excerpt]
 * @property {number} [wordCount]
 */

/**
 * @typedef {Object} RenderContext
 * @property {Object} site
 * @property {string} site.title
 * @property {string} site.description
 * @property {string} site.base_url
 * @property {Object} author
 * @property {string} author.npub
 * @property {string} author.pubkey
 * @property {ProfileMetadata} author.profile
 * @property {Article[]} articles
 */

/**
 * @typedef {Object} MediaAsset
 * @property {string} url
 * @property {string} localPath
 * @property {string} mime
 */

export {};
