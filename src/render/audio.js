import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

// ── Build-time audio narration (Kokoro-82M TTS) ──────────────────────────────
// Synthesizes a spoken version of every article plus one concatenated
// "whole blog" episode using kokoro-js. The model downloads once into
// nostr-cache/hf and then runs fully offline on CPU; artifacts are
// content-hashed so unchanged stories are never re-rendered. Anything
// failing throws for the caller to catch — audio must never break builds.

const ENGINE = {
  repo: "onnx-community/Kokoro-82M-v1.0-ONNX",
  dtype: "q8", // compact + fast on CPU; quality is plenty for narration
  device: "cpu", // onnxruntime-node CPU path
  voice: process.env.NARRATION_VOICE || "af_heart",
};
const SAMPLE_RATE = 24000;
const MAX_SCRIPT_CHARS = 20000;
const CHUNK_CHARS = 800; // sentence-capped synthesis chunks

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fileSha(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);
}

// ── Engine bootstrap ─────────────────────────────────────────────────────────

let enginePromise = null;

// Ensures the model weights live inside the project cache and that the TTS
// singleton is loaded. Loading takes ~5s; generation alone is ~0.45x RTF.
function ensureEngine(cacheDir) {
  enginePromise ??= (async () => {
    const hfCache = path.join(cacheDir, "hf");
    ensureDir(hfCache);
    const { env } = await import("@huggingface/transformers");
    env.cacheDir = hfCache; // keep the ~300MB weights in nostr-cache, not ~
    const { KokoroTTS } = await import("kokoro-js");
    const tts = await KokoroTTS.from_pretrained(ENGINE.repo, {
      dtype: ENGINE.dtype,
      device: ENGINE.device,
    });
    return tts;
  })();
  return enginePromise;
}

// ── Speech script ─────────────────────────────────────────────────────────────

const FOLDS = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "..." };
const TABLE_ROW_CAP = 10;

// Listener-friendly units for table cells: "~15s" → "about 15 seconds",
// "350MB" → "350 megabytes", "90%" → "90 percent", "$5" → "5 dollars".
function phrasedUnits(cell) {
  let t = cell.trim();
  t = t.replace(/^~/, "about ");
  t = t.replace(/\$(\d+(?:\.\d+)?)/g, "$1 dollars");
  t = t.replace(/(\d+(?:\.\d+)?)\s?TB\b/gi, "$1 terabytes");
  t = t.replace(/(\d+(?:\.\d+)?)\s?GB\b/gi, "$1 gigabytes");
  t = t.replace(/(\d+(?:\.\d+)?)\s?MB\b/gi, "$1 megabytes");
  t = t.replace(/(\d+(?:\.\d+)?)\s?KB\b/gi, "$1 kilobytes");
  t = t.replace(/(\d+(?:\.\d+)?)\s?ms\b/gi, "$1 milliseconds");
  t = t.replace(/(\d+(?:\.\d+)?)\s?s\b/gi, "$1 seconds");
  t = t.replace(/(\d+(?:\.\d+)?)\s?%/g, "$1 percent");
  t = t.replace(/(\d+(?:\.\d+)?)\s?x\b/gi, "$1 times");
  return t.replace(/\s+/g, " ").trim();
}

function joinWith(parts) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// Fenced code → a spoken marker, optionally anchored by its first comment
// line ("described as…"); raw code is never dumped into the voice.
function codeBlockToSpeech(code) {
  const line = String(code)
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && (/^\/\//.test(l) || /^#\s/.test(l) || /^\/\*/.test(l)));
  if (!line) return " A code block follows. ";
  return ` A code block follows, described as: ${line.replace(/^\/\/|#+\s*|\/\*|\*\//g, "").trim()}. `;
}

function isSeparatorRow(cells) {
  return cells.every((c) => /^:?-{1,}:?$/.test(c) || c.trim() === "");
}

// Comparison tables can't be seen by a person listening, so the row-and-column
// structure is re-spoken as sentences: header names spoken once, then each
// row as `Label: Column, value. Column, value.`
function renderPipeTable(lines) {
  const rows = lines
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => phrasedUnits(c))
    )
    .filter((cells) => cells.length && cells.some((c) => c));

  if (!rows.length) return "";
  const sepIndex = rows.findIndex(isSeparatorRow);
  let header = null;
  let dataRows = rows;
  if (sepIndex > 0) {
    header = rows[sepIndex - 1];
    dataRows = rows.filter((_, i) => i !== sepIndex - 1 && i !== sepIndex);
  } else if (sepIndex === 0) {
    dataRows = rows.filter((_, i) => i !== 0);
  }

  // Degenerate tables (single column, no header) read as a plain list.
  if (!header || header.length < 2 || !dataRows.length) {
    const items = rows.flat().filter((c) => c && !isSeparatorRow([c])).slice(0, 24);
    if (!items.length) return "";
    return ` A list: ${items.join(". ")}. `;
  }

  const valueCols = header.slice(1);
  const capped = dataRows.slice(0, TABLE_ROW_CAP);
  let speech = ` A data table with ${header.length} columns: ${joinWith(header)}. `;
  capped.forEach((row) => {
    const label = row[0] || "Next row";
    const parts = [];
    for (let i = 1; i < Math.min(row.length, header.length); i++) {
      if (row[i]) parts.push(`${valueCols[i - 1] || `Column ${i}`}, ${row[i]}`);
    }
    if (parts.length) speech += `${label}: ${parts.join(". ")}. `;
  });
  const hidden = dataRows.length - capped.length;
  if (hidden > 0) speech += `And ${hidden} more rows. `;
  return speech;
}

function pipeTablesToSpeech(text) {
  const lines = String(text).split("\n");
  const out = [];
  let tableLines = null;
  const flush = () => {
    if (tableLines) out.push(renderPipeTable(tableLines));
    tableLines = null;
  };
  for (const line of lines) {
    if (/^\s*\|.*\|/.test(line)) {
      if (!tableLines) tableLines = [];
      tableLines.push(line);
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join("\n");
}

function markdownToSpeech(markdown) {
  let text = String(markdown || "");
  // Code fences first (so tables inside code stay inert), then pipe tables.
  text = text.replace(/```[\s\S]*?```/g, codeBlockToSpeech);
  text = pipeTablesToSpeech(text);
  text = text.replace(/`([^`]*)`/g, "$1");
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, " ");
  text = text.replace(/^#{1,6}\s+/gm, " ");
  text = text.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, " ");
  text = text.replace(/^>\s?/gm, " ");
  text = text.replace(/[*_~|]|<[^>]*>/gi, " ");
  text = text.replace(/#(?=\w)/g, "");
  for (const [from, to] of Object.entries(FOLDS)) text = text.split(from).join(to);
  // Drop emoji/pictographs the phonemizer would stutter on, then collapse space.
  text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length <= MAX_SCRIPT_CHARS) return text;
  // Truncate at a sentence boundary so clips never end mid-word.
  const cut = text.slice(0, MAX_SCRIPT_CHARS);
  const dot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (dot > MAX_SCRIPT_CHARS * 0.5 ? cut.slice(0, dot + 1) : cut).trim();
}

function narrationScript(article, authorName) {
  const ts = Number(article.published_at) || 0;
  const date = new Date(ts < 1e12 ? ts * 1000 : ts);
  const dateStr = Number.isNaN(date.getTime())
    ? ""
    : ` ${date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
  const body = markdownToSpeech(article.content);
  return `${article.title}. Written by ${authorName}${dateStr}. ${body}`.trim();
}

// ── Synthesis + conversion ────────────────────────────────────────────────────

function splitSentences(text, maxChars = CHUNK_CHARS) {
  const parts = [];
  let buf = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (buf && (buf + " " + sentence).length > maxChars) {
      parts.push(buf);
      buf = sentence;
    } else {
      buf = buf ? `${buf} ${sentence}` : sentence;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.length ? parts : [text];
}

function mp3Seconds(mp3Path) {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3Path,
    ]).toString().trim();
    return Math.max(1, Math.round(parseFloat(out) || 0));
  } catch {
    return 0;
  }
}

// ── ID3 metadata ──────────────────────────────────────────────────────────────
// Players show these tags instead of filenames, and the whole-blog episode
// reads as a proper collection album.

function metaArgs(meta) {
  return Object.entries(meta).flatMap(([k, v]) => ["-metadata", `${k}=${v}`]);
}

function probeTags(mp3) {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "quiet", "-print_format", "json", "-show_format", mp3,
    ]).toString();
    return JSON.parse(out).format?.tags || {};
  } catch {
    return {};
  }
}

// Tag-stamps an existing mp3 without touching the audio stream (-c copy),
// skipping the rewrite when the tags already match. This is how clips from
// earlier builds adopt richer metadata without any re-synthesis.
function ensureTags(mp3, meta) {
  const current = probeTags(mp3);
  const matches = ["title", "artist", "album", "date", "genre", "track", "publisher"].every(
    (k) => !meta[k] || String(current[k] ?? current[k.charAt(0).toUpperCase() + k.slice(1)] ?? "") === String(meta[k])
  );
  if (matches) return false;
  const part = `${mp3}.tags-${process.pid}.mp3`;
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", mp3, "-map_metadata", "-1", "-id3v2_version", "3",
    ...metaArgs(meta), "-codec:a", "copy", part,
  ]);
  fs.renameSync(part, mp3);
  return true;
}

function storyMeta(context, article, track, total) {
  const author = context.author.profile;
  const authorName = author.display_name || author.name || context.site.title;
  const ts = Number(article.published_at) || 0;
  const date = new Date(ts < 1e12 ? ts * 1000 : ts);
  return {
    title: article.title,
    artist: authorName,
    album: context.site.title,
    album_artist: authorName,
    date: Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10),
    track: `${track}/${total}`,
    genre: "Podcast",
    publisher: "NostrPress",
  };
}

function wholeMeta(context, total) {
  const author = context.author.profile;
  const authorName = author.display_name || author.name || context.site.title;
  return {
    title: `${context.site.title} — Complete Audio Edition`,
    artist: authorName,
    album: context.site.title,
    album_artist: authorName,
    date: new Date().toISOString().slice(0, 10),
    track: `1/${total}`,
    genre: "Audiobook",
    publisher: "NostrPress",
  };
}

// Kokoro's generate() works best on sentence-bounded chunks: synthesize each
// chunk to its own wav, then ffmpeg-concat straight into a 96k mp3 (metadata
// stamped in the same pass). Temp files are per-process so concurrent builds
// never fight over scratch space.
async function synthesizeToMp3(tts, script, mp3Path, tmpDir, meta = {}) {
  ensureDir(tmpDir);
  try {
    const listLines = [];
    const chunks = splitSentences(script);
    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = path.join(tmpDir, `chunk-${String(i).padStart(4, "0")}.wav`);
      const audio = await tts.generate(chunks[i], { voice: ENGINE.voice });
      await audio.save(chunkPath);
      listLines.push(`file '${path.basename(chunkPath)}'`);
    }
    const listPath = path.join(tmpDir, "chunks.txt");
    fs.writeFileSync(listPath, `${listLines.join("\n")}\n`);
    const part = `${mp3Path}.${process.pid}.part.mp3`;
    execFileSync("ffmpeg", [
      "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-map_metadata", "-1", "-id3v2_version", "3",
      ...metaArgs(meta),
      "-codec:a", "libmp3lame", "-b:a", "96k", part,
    ]);
    fs.renameSync(part, mp3Path);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export { markdownToSpeech }; // handy for probing narration scripts in isolation

// Synthesize (or reuse the cached) narration for one script. The cache key is
// the engine + voice + full script hash, so edits to a story create a fresh
// clip while untouched stories survive clean rebuilds and voice swaps land in
// their own cache entries.
async function renderScriptToMp3(tts, cacheDir, key, script, meta = {}) {
  const hash = fileSha(`${ENGINE.repo}/${ENGINE.voice}\n${script}`);
  const mp3 = path.join(cacheDir, `${key}-${hash}.mp3`);
  const durSidecar = `${mp3}.dur`;
  if (!fs.existsSync(mp3)) {
    ensureDir(cacheDir);
    const tmpDir = path.join(cacheDir, `.kok-${process.pid}-${hash}`);
    try {
      await synthesizeToMp3(tts, script, mp3, tmpDir, meta);
    } catch (err) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw err;
    }
    fs.writeFileSync(durSidecar, String(mp3Seconds(mp3)));
  } else {
    ensureTags(mp3, meta); // cached clip: stamp tags without re-synthesis
  }
  let seconds;
  if (fs.existsSync(durSidecar)) seconds = parseInt(fs.readFileSync(durSidecar, "utf8").trim(), 10) || 0;
  if (!seconds) {
    seconds = mp3Seconds(mp3);
    fs.writeFileSync(durSidecar, String(seconds));
  }
  return { mp3, seconds };
}

// ── Whole-blog episode ────────────────────────────────────────────────────────

function concatMp3(introMp3, storyMp3s, outputPath, meta = {}) {
  ensureDir(path.dirname(outputPath));
  const args = ["-v", "error", "-y", "-i", introMp3];
  const labels = ["[0:a]"];
  storyMp3s.forEach((storyMp3, i) => {
    args.push("-i", storyMp3); // slot 2i+1
    labels.push(`[${2 * i + 1}:a]`);
    args.push("-f", "lavfi", "-t", "1.2", "-i", `anullsrc=r=${SAMPLE_RATE}:cl=mono`); // slot 2i+2
    labels.push(`[${2 * i + 2}:a]`);
  });
  args.push(
    "-filter_complex", `${labels.join("")}concat=n=${labels.length}:v=0:a=1[out]`,
    "-map", "[out]",
    "-map_metadata", "-1", "-id3v2_version", "3",
    ...metaArgs(meta),
    "-codec:a", "libmp3lame", "-b:a", "96k",
    outputPath
  );
  execFileSync("ffmpeg", args);
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function generateAudio({ context, outputDir, cacheDir }) {
  const tts = await ensureEngine(cacheDir);

  const audioCacheDir = path.join(cacheDir, "audio");
  const distAudioDir = path.join(outputDir, "audio");
  ensureDir(audioCacheDir);
  fs.rmSync(distAudioDir, { recursive: true, force: true }); // flush stale clips; cache is the source of truth
  ensureDir(distAudioDir);

  const author = context.author.profile;
  const authorName = author.display_name || author.name || context.site.title;
  const items = [];

  for (const article of context.articles) {
    const script = narrationScript(article, authorName);
    const meta = storyMeta(context, article, items.length + 1, context.articles.length);
    const { mp3, seconds } = await renderScriptToMp3(tts, audioCacheDir, article.slug, script, meta);
    fs.copyFileSync(mp3, path.join(distAudioDir, `${article.slug}.mp3`));
    article.audioMinutes = Math.max(1, Math.ceil(seconds / 60));
    items.push({ slug: article.slug, minutes: article.audioMinutes, seconds, mp3 });
  }

  // Whole-blog episode: spoken intro + every story in order, 1.2s pauses.
  const intro =
    `The complete audio edition of ${context.site.title}, written and published on Nostr by ${authorName}. ` +
    `Presenting ${items.length} stories, read in order.`;
  const storyClipKey = items.map((i) => path.basename(i.mp3)).join("|");
  const wholeHash = fileSha(`${ENGINE.repo}/${ENGINE.voice}\n${intro}\n${storyClipKey}`);
  const wholeMp3 = path.join(audioCacheDir, `whole-blog-${wholeHash}.mp3`);
  if (!fs.existsSync(wholeMp3)) {
    const { mp3: introMp3 } = await renderScriptToMp3(tts, audioCacheDir, "whole-blog-intro", intro);
    concatMp3(introMp3, items.map((i) => i.mp3), wholeMp3, wholeMeta(context, items.length + 1));
    fs.writeFileSync(`${wholeMp3}.dur`, String(mp3Seconds(wholeMp3)));
  }
  ensureTags(wholeMp3, wholeMeta(context, items.length + 1)); // no-op when tags already match
  const wholeSeconds =
    (fs.existsSync(`${wholeMp3}.dur`) && parseInt(fs.readFileSync(`${wholeMp3}.dur`, "utf8").trim(), 10)) ||
    mp3Seconds(wholeMp3) ||
    0;
  fs.copyFileSync(wholeMp3, path.join(distAudioDir, "whole-blog.mp3"));
  const wholeBlog = { minutes: Math.max(1, Math.ceil(wholeSeconds / 60)) };
  context.audio = { wholeBlog };

  return { count: items.length, items, wholeBlog };
}
