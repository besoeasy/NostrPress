import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

// ── Build-time audio narration (Piper TTS) ───────────────────────────────────
// Synthesizes a spoken version of every article plus one concatenated
// "whole blog" episode. Runs fully offline after a one-time engine download
// into nostr-cache; artifacts are content-hashed so unchanged stories are
// never re-rendered. Anything failing throws for the caller to catch —
// audio is a bonus and must never break the build.

const PIPER_VERSION = "2023.11.14-2";
const PIPER_TARBALL = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz`;
const VOICE = {
  name: "en_US-ryan-high",
  onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx",
  config: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx.json",
};
const MAX_SCRIPT_CHARS = 20000;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fileSha(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);
}

async function download(url, target, minBytes) {
  ensureDir(path.dirname(target));
  if (fs.existsSync(target) && fs.statSync(target).size >= minBytes) return;
  const res = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status}) ${url}`);
  const tmp = `${target}.part`;
  await fs.promises.writeFile(tmp, res.body);
  fs.renameSync(tmp, target);
  if (fs.statSync(target).size < minBytes) throw new Error(`incomplete download: ${path.basename(target)}`);
}

// ── Engine bootstrap ─────────────────────────────────────────────────────────

function ensureEngine(cacheDir) {
  const engineRoot = path.join(cacheDir, "piper"); // nostr-cache/piper
  const binDir = path.join(engineRoot, "piper"); // release tarball nests as piper/piper
  const bin = path.join(binDir, "piper");

  if (!fs.existsSync(bin)) {
    ensureDir(engineRoot);
    const tarball = path.join(engineRoot, "engine.tar.gz");
    if (!fs.existsSync(tarball) || fs.statSync(tarball).size < 20_000_000) {
      execFileSync(
        "curl",
        ["-fSL", "--retry", "2", "--connect-timeout", "20", "-o", tarball, PIPER_TARBALL],
        { timeout: 300000, stdio: ["ignore", "ignore", "inherit"] }
      );
      if (!fs.existsSync(tarball) || fs.statSync(tarball).size < 20_000_000) {
        throw new Error("piper engine archive incomplete");
      }
    }
    execFileSync("tar", ["-xzf", tarball, "-C", engineRoot]);
    fs.rmSync(tarball, { force: true });
    if (!fs.existsSync(bin)) throw new Error("piper binary not found in engine archive");
  }

  const voicesDir = path.join(engineRoot, "voices");
  ensureDir(voicesDir);
  return { bin, binDir, voicesDir };
}

async function ensureVoice(voicesDir) {
  const model = path.join(voicesDir, `${VOICE.name}.onnx`);
  await Promise.all([
    download(VOICE.onnx, model, 40_000_000),
    download(VOICE.config, `${model}.json`, 200),
  ]);
  return model;
}

// ── Speech script ─────────────────────────────────────────────────────────────

const FOLDS = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "..." };

function markdownToSpeech(markdown) {
  let text = String(markdown || "");
  text = text.replace(/```[\s\S]*?```/g, " ");
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
  // Drop emoji/pictographs the phonemizer would choke on, then collapse space.
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

function synthesize({ bin, binDir, model }, text, wavPath) {
  const res = spawnSync(bin, ["--model", model, "--output_file", wavPath], {
    input: `${text}\n`,
    cwd: binDir, // piper finds espeak-ng-data relative to its own dir
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  // Piper occasionally reports a nonzero exit at teardown even after a full
  // render — if audio actually landed, accept it and move on.
  const rendered = fs.existsSync(wavPath) && fs.statSync(wavPath).size > 5000;
  if (!rendered) {
    const tail = String(res.stderr || "").split("\n").slice(-3).join(" ").trim();
    throw new Error(`piper failed${res.status ? ` (${res.status})` : ""}: ${tail}`);
  }
}

function wavToMp3(wavPath, mp3Path) {
  // Convert to a temp name and rename into place so concurrent paths reading
  // the cache never observe a half-written clip.
  const part = `${mp3Path}.${process.pid}.part.mp3`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wavPath, "-codec:a", "libmp3lame", "-b:a", "96k", part]);
  fs.renameSync(part, mp3Path);
  fs.rmSync(wavPath, { force: true });
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

// Synthesize (or reuse the cached) narration for one script. The cache key is
// the VOICE + full script hash, so edits to a story create a fresh clip while
// untouched stories survive clean rebuilds.
function renderScriptToMp3(engine, cacheDir, key, script) {
  const hash = fileSha(`${VOICE.name}\n${script}`);
  const mp3 = path.join(cacheDir, `${key}-${hash}.mp3`);
  const durSidecar = `${mp3}.dur`;
  if (!fs.existsSync(mp3)) {
    ensureDir(cacheDir);
    // Per-process temp wav: concurrent builds (manual run + watcher) never
    // share scratch files, and the final mp3 is renamed in atomically.
    const wav = `${cacheDir}/.tmp-${process.pid}-${hash}.wav`;
    try {
      synthesize(engine, script, wav);
      wavToMp3(wav, mp3);
    } catch (err) {
      fs.rmSync(wav, { force: true });
      throw err;
    }
    fs.writeFileSync(durSidecar, String(mp3Seconds(mp3)));
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

function concatMp3(introMp3, storyMp3s, outputPath) {
  ensureDir(path.dirname(outputPath));
  const args = ["-v", "error", "-y", "-i", introMp3];
  const labels = ["[0:a]"];
  storyMp3s.forEach((storyMp3, i) => {
    args.push("-i", storyMp3); // slot 2i+1
    labels.push(`[${2 * i + 1}:a]`);
    args.push("-f", "lavfi", "-t", "1.2", "-i", "anullsrc=r=22050:cl=mono"); // slot 2i+2
    labels.push(`[${2 * i + 2}:a]`);
  });
  args.push(
    "-filter_complex", `${labels.join("")}concat=n=${labels.length}:v=0:a=1[out]`,
    "-map", "[out]",
    "-codec:a", "libmp3lame", "-b:a", "96k",
    outputPath
  );
  execFileSync("ffmpeg", args);
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function generateAudio({ context, outputDir, cacheDir }) {
  const engine = { ...ensureEngine(cacheDir), model: await ensureVoice(path.join(cacheDir, "piper", "voices")) };

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
    const { mp3, seconds } = renderScriptToMp3(engine, audioCacheDir, article.slug, script);
    fs.copyFileSync(mp3, path.join(distAudioDir, `${article.slug}.mp3`));
    article.audioMinutes = Math.max(1, Math.ceil(seconds / 60));
    items.push({ slug: article.slug, minutes: article.audioMinutes, seconds, mp3 });
  }

  // Whole-blog episode: spoken intro + every story in order, 1.2s pauses.
  const intro =
    `The complete audio edition of ${context.site.title}, written and published on Nostr by ${authorName}. ` +
    `Presenting ${items.length} stories, read in order.`;
  const storyClipKey = items.map((i) => path.basename(i.mp3)).join("|");
  const wholeHash = fileSha(`${VOICE.name}\n${intro}\n${storyClipKey}`);
  const wholeMp3 = path.join(audioCacheDir, `whole-blog-${wholeHash}.mp3`);
  if (!fs.existsSync(wholeMp3)) {
    const { mp3: introMp3 } = renderScriptToMp3(engine, audioCacheDir, "whole-blog-intro", intro);
    concatMp3(introMp3, items.map((i) => i.mp3), wholeMp3);
    fs.writeFileSync(`${wholeMp3}.dur`, String(mp3Seconds(wholeMp3)));
  }
  const wholeSeconds =
    (fs.existsSync(`${wholeMp3}.dur`) && parseInt(fs.readFileSync(`${wholeMp3}.dur`, "utf8").trim(), 10)) ||
    mp3Seconds(wholeMp3) ||
    0;
  fs.copyFileSync(wholeMp3, path.join(distAudioDir, "whole-blog.mp3"));
  const wholeBlog = { minutes: Math.max(1, Math.ceil(wholeSeconds / 60)) };
  context.audio = { wholeBlog };

  return { count: items.length, items, wholeBlog };
}
