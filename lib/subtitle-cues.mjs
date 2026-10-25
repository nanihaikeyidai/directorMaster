import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{ startMs: number, endMs: number, text: string, translation?: string }} SubtitleCue
 */

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

/** @param {number} ms */
export function formatSrtTimestamp(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/** @param {number} ms */
function formatAssTimestamp(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const centis = Math.floor((total % 1000) / 10);
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

function parseClockToMs(value) {
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  const match = text.match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) throw new Error(`无法解析时间戳：${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const frac = match[4].padEnd(3, '0').slice(0, 3);
  return ((hours * 3600 + minutes * 60 + seconds) * 1000) + Number(frac);
}

function parsePlainTimedLine(line) {
  const arrow = String(line).match(
    /^(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s+(.+)$/,
  );
  if (arrow) {
    return {
      startMs: parseClockToMs(arrow[1]),
      endMs: parseClockToMs(arrow[2]),
      text: arrow[3].trim(),
    };
  }
  const dash = String(line).match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*[ \t]+(.+)$/);
  if (dash) {
    return {
      startMs: Math.round(Number(dash[1]) * 1000),
      endMs: Math.round(Number(dash[2]) * 1000),
      text: dash[3].trim(),
    };
  }
  throw new Error(`无法解析字幕行：${line}`);
}

function coerceCue(raw, index) {
  if (typeof raw === 'string') return parsePlainTimedLine(raw);

  if (!raw || typeof raw !== 'object') {
    throw new Error(`cue[${index}] 非法：需要对象或带时间轴的文本行`);
  }

  let startMs;
  let endMs;
  if (Number.isFinite(raw.startMs) && Number.isFinite(raw.endMs)) {
    startMs = Number(raw.startMs);
    endMs = Number(raw.endMs);
  } else if (Number.isFinite(raw.start) && Number.isFinite(raw.end)) {
    startMs = Math.round(Number(raw.start) * 1000);
    endMs = Math.round(Number(raw.end) * 1000);
  } else if (raw.start != null && raw.end != null) {
    startMs = parseClockToMs(raw.start);
    endMs = parseClockToMs(raw.end);
  } else {
    throw new Error(`cue[${index}] 缺少 start/end 或 startMs/endMs`);
  }

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error(`cue[${index}] 时间戳非有限数`);
  }
  if (endMs <= startMs) {
    throw new Error(`cue[${index}] inverted duration: endMs (${endMs}) must be > startMs (${startMs})`);
  }

  const text = String(raw.text ?? raw.source ?? '').trim();
  if (!text) throw new Error(`cue[${index}] empty text`);

  /** @type {SubtitleCue} */
  const cue = { startMs, endMs, text };
  const translation = raw.translation ?? raw.target;
  if (translation != null && String(translation).trim()) {
    cue.translation = String(translation).trim();
  }
  return cue;
}

/**
 * Normalize ASR-like JSON / timed lines into sorted cues.
 * @param {unknown} input
 * @returns {SubtitleCue[]}
 */
export function normalizeCues(input) {
  let list;
  if (Array.isArray(input)) list = input;
  else if (input && typeof input === 'object' && Array.isArray(input.cues)) list = input.cues;
  else throw new Error('normalizeCues 需要 cue 数组或 { cues: [...] }');

  const cues = list.map((item, index) => coerceCue(item, index));
  cues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return cues;
}

/**
 * @param {SubtitleCue[]} cues
 * @param {{ field?: 'text' | 'translation' }} [options]
 */
export function cuesToSrt(cues, options = {}) {
  const field = options.field === 'translation' ? 'translation' : 'text';
  const blocks = [];
  let index = 1;
  for (const cue of cues) {
    const body = field === 'translation' ? (cue.translation || cue.text) : cue.text;
    if (!body) continue;
    blocks.push(
      `${index}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}\n${body}\n`,
    );
    index += 1;
  }
  return blocks.join('\n');
}

/**
 * @param {SubtitleCue[]} cues
 * @param {{ sourceLang?: string, targetLang?: string }} [options]
 */
export function cuesToAssBilingual(cues, options = {}) {
  const sourceLang = options.sourceLang || 'zh';
  const targetLang = options.targetLang || 'en';
  const header = [
    '[Script Info]',
    'Title: Director Master Bilingual Subtitles',
    'ScriptType: v4.00+',
    `Comment: langs ${sourceLang}+${targetLang}`,
    'PlayResX: 1920',
    'PlayResY: 1080',
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Primary,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,40,40,60,1',
    'Style: Translation,Arial,36,&H00AAAAAA,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,24,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events = [];
  for (const cue of cues) {
    const start = formatAssTimestamp(cue.startMs);
    const end = formatAssTimestamp(cue.endMs);
    const primary = cue.text.replace(/\n/g, '\\N');
    events.push(`Dialogue: 0,${start},${end},Primary,,0,0,0,,${primary}`);
    if (cue.translation) {
      const secondary = cue.translation.replace(/\n/g, '\\N');
      events.push(`Dialogue: 0,${start},${end},Translation,,0,0,0,,${secondary}`);
    }
  }
  return `${header.join('\n')}\n${events.join('\n')}\n`;
}

/**
 * @param {string} outDir
 * @param {unknown} cuesInput
 * @param {{ sourceLang?: string, targetLang?: string, basename?: string, translations?: (string | undefined)[] }} [options]
 */
export function writeBilingualSubtitles(outDir, cuesInput, options = {}) {
  const cues = normalizeCues(cuesInput).map((cue, index) => {
    if (cue.translation) return cue;
    const fromMap = options.translations?.[index];
    if (fromMap != null && String(fromMap).trim()) {
      return { ...cue, translation: String(fromMap).trim() };
    }
    return cue;
  });

  const sourceLang = options.sourceLang || 'zh';
  const targetLang = options.targetLang || 'en';
  const basename = options.basename || 'subtitles';
  mkdirSync(outDir, { recursive: true });

  const srtSource = path.join(outDir, `${basename}.${sourceLang}.srt`);
  const srtTarget = path.join(outDir, `${basename}.${targetLang}.srt`);
  const assPath = path.join(outDir, `${basename}.bilingual.ass`);

  writeFileSync(srtSource, cuesToSrt(cues, { field: 'text' }), 'utf8');
  writeFileSync(srtTarget, cuesToSrt(cues, { field: 'translation' }), 'utf8');
  writeFileSync(assPath, cuesToAssBilingual(cues, { sourceLang, targetLang }), 'utf8');

  return { srtSource, srtTarget, ass: assPath, cueCount: cues.length };
}

const SUBTITLE_CLASS_MARKERS = [/confucius/i, /r2t2/i, /\basr\b/i, /speech.?to.?text/i, /whisper/i];

/**
 * Heuristic-only; does not submit cloud jobs.
 * @param {any} workflow
 * @returns {'asr-r2t2' | null}
 */
export function detectSubtitleWorkflowKind(workflow) {
  if (!workflow || typeof workflow !== 'object') return null;
  const classes = Object.values(workflow)
    .filter((value) => value && typeof value === 'object')
    .map((value) => String(value.class_type || ''));
  const hit = classes.some((classType) => SUBTITLE_CLASS_MARKERS.some((re) => re.test(classType)));
  return hit ? 'asr-r2t2' : null;
}
