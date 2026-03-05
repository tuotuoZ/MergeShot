import type { FileMetadata, ClipInfo, Session, SessionWarning } from '../types';

/**
 * Gap threshold (ms) between consecutive clips' mtimes before we consider
 * them separate recording sessions. Default: 5 minutes.
 */
const DEFAULT_GAP_MS = 5 * 60 * 1000;

interface ParsedFilename {
  /** The stable part of the name that identifies a session (e.g. "DJI_", "GH", date string) */
  sessionKey: string;
  /** The numeric sequence within the session (chapter / segment counter) */
  sequence: number;
  /** For GoPro new format: clip "base" number (same base = same recording) */
  baseNumber?: number;
  extension: string;
  cameraType: 'dji' | 'gopro' | 'generic';
}

// ─── Regex patterns ────────────────────────────────────────────────────────────

// DJI Action 2/3/4/5: DJI_NNNN.MP4
const RE_DJI_SIMPLE = /^(DJI_)(\d+)(\.(?:mp4|mov|avi))$/i;

// DJI newer: DJI_20240101_123456_0001_D.MP4
const RE_DJI_DATED = /^(DJI_\d{8}_\d{6}_)(\d+)(_[A-Z]\.(?:mp4|mov))$/i;

// DJI Osmo / other: DJI_20240101HHMMSS_NNNN.MP4
const RE_DJI_TS = /^(DJI_\d{14}_?)(\d+)(\.(?:mp4|mov))$/i;

// GoPro Hero5+ new: GH011234.MP4, GX021234.MP4
// prefix=GH/GX/GS  chapter=01  clip_base=1234
const RE_GOPRO_NEW = /^(G[HXSO])(\d{2})(\d{4})(\.(?:mp4|mov))$/i;

// GoPro old first chapter: GOPR1234.MP4
const RE_GOPRO_OLD_FIRST = /^(GOPR)(\d+)(\.(?:mp4|mov))$/i;

// GoPro old subsequent: GP011234.MP4
const RE_GOPRO_OLD_CHAPTER = /^(GP)(\d{2})(\d{4})(\.(?:mp4|mov))$/i;

// Generic sequential: prefix + digits + extension
const RE_GENERIC = /^(.*?)(\d+)(\.(?:mp4|mov|avi|mts|m2ts|mkv|m4v))$/i;

function parseFilename(filename: string): ParsedFilename | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  // DJI dated (longer, try first)
  let m = filename.match(RE_DJI_DATED);
  if (m) {
    return { sessionKey: m[1] + m[3], sequence: parseInt(m[2], 10), extension: ext, cameraType: 'dji' };
  }

  m = filename.match(RE_DJI_TS);
  if (m) {
    return { sessionKey: m[1], sequence: parseInt(m[2], 10), extension: ext, cameraType: 'dji' };
  }

  m = filename.match(RE_DJI_SIMPLE);
  if (m) {
    return { sessionKey: m[1], sequence: parseInt(m[2], 10), extension: ext, cameraType: 'dji' };
  }

  // GoPro new
  m = filename.match(RE_GOPRO_NEW);
  if (m) {
    const chapter = parseInt(m[2], 10);
    const base = parseInt(m[3], 10);
    // sessionKey = prefix + base number (same base = same recording)
    return {
      sessionKey: `${m[1]}_${m[3]}`,
      sequence: chapter,
      baseNumber: base,
      extension: ext,
      cameraType: 'gopro',
    };
  }

  // GoPro old first-chapter
  m = filename.match(RE_GOPRO_OLD_FIRST);
  if (m) {
    return {
      sessionKey: `${m[1]}_${m[2]}`,
      sequence: 0,
      baseNumber: parseInt(m[2], 10),
      extension: ext,
      cameraType: 'gopro',
    };
  }

  // GoPro old subsequent chapter
  m = filename.match(RE_GOPRO_OLD_CHAPTER);
  if (m) {
    const chapter = parseInt(m[2], 10);
    const base = parseInt(m[3], 10);
    return {
      sessionKey: `GP_${m[3]}`,
      sequence: chapter,
      baseNumber: base,
      extension: ext,
      cameraType: 'gopro',
    };
  }

  // Generic fallback
  m = filename.match(RE_GENERIC);
  if (m) {
    return {
      sessionKey: m[1].toLowerCase(),
      sequence: parseInt(m[2], 10),
      extension: ext,
      cameraType: 'generic',
    };
  }

  return null;
}

// ─── Session name derivation ──────────────────────────────────────────────────

function deriveSessionName(clips: FileMetadata[], sessionKey: string): string {
  // Use first clip mtime to build a human-readable date
  const mtime = clips[0]?.mtime ?? Date.now();
  const d = new Date(mtime);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timeStr = `${pad(d.getHours())}${pad(d.getMinutes())}`;

  // Clean up the session key for display
  const cleanKey = sessionKey
    .replace(/\.[^.\s]+$/, '')        // strip trailing file extension (e.g. ".MOV")
    .replace(/[_\-]+$/, '')           // trailing separators
    .replace(/^[_\-]+/, '')           // leading separators
    .replace(/[_\-]+/g, ' ')
    .replace(/[^\w\s]/g, '')          // remove dots and other punctuation
    .trim()
    .toUpperCase();

  return `${cleanKey || 'Session'} ${dateStr} ${timeStr}`;
}

// ─── Main grouping function ───────────────────────────────────────────────────

let sessionIdCounter = 0;
function nextId() {
  return `session-${Date.now()}-${++sessionIdCounter}`;
}

function makeClip(meta: FileMetadata): ClipInfo {
  return { ...meta, probeStatus: 'pending' };
}

export function groupFilesIntoSessions(
  files: FileMetadata[],
  gapMs = DEFAULT_GAP_MS
): Session[] {
  if (files.length === 0) return [];

  // ── 1. Parse each filename ─────────────────────────────────────────────────
  const parsed = files.map((f) => ({ file: f, parsed: parseFilename(f.filename) }));

  // ── 2. Group by sessionKey ─────────────────────────────────────────────────
  const groupMap = new Map<string, typeof parsed>();

  for (const item of parsed) {
    // For unparsed files, use the filename stripped of its extension as the key
    // so "Screen Recording.MOV" doesn't inject "MOV" into the session name.
    const fallbackKey = `__unparsed__${item.file.filename.replace(/\.[^.]+$/, '')}`;
    const key = item.parsed?.sessionKey ?? fallbackKey;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(item);
  }

  const sessions: Session[] = [];

  for (const [sessionKey, items] of groupMap) {
    // Sort within group by sequence number, then mtime fallback
    items.sort((a, b) => {
      if (a.parsed && b.parsed) {
        return a.parsed.sequence - b.parsed.sequence;
      }
      return a.file.mtime - b.file.mtime;
    });

    // ── 3. Sub-split on time gaps within a group ────────────────────────────
    const subGroups: typeof items[] = [];
    let current: typeof items = [items[0]];

    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1].file;
      const curr = items[i].file;
      const timeDiff = Math.abs(curr.mtime - prev.mtime);

      // Also detect non-contiguous sequence (gap > 1)
      const seqGap =
        items[i].parsed && items[i - 1].parsed
          ? items[i].parsed!.sequence - items[i - 1].parsed!.sequence - 1
          : 0;

      if (timeDiff > gapMs || seqGap > 1) {
        subGroups.push(current);
        current = [];
      }
      current.push(items[i]);
    }
    subGroups.push(current);

    // ── 4. Create Session objects ───────────────────────────────────────────
    for (const group of subGroups) {
      const clips = group.map((g) => makeClip(g.file));
      const warnings = detectWarnings(group.map((g) => g.file), group.map((g) => g.parsed));

      const name = deriveSessionName(
        group.map((g) => g.file),
        sessionKey
      );

      const defaultFilename = name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') + '.mp4';

      sessions.push({
        id: nextId(),
        name,
        clips,
        outputDir: '',           // Filled in by the store from remembered last path
        outputFilename: defaultFilename,
        mergeMode: 'fast',
        status: warnings.length > 0 ? 'warning' : 'ready',
        warnings,
        collapsed: false,
      });
    }
  }

  // Sort sessions by first clip mtime
  sessions.sort((a, b) => (a.clips[0]?.mtime ?? 0) - (b.clips[0]?.mtime ?? 0));

  return sessions;
}

// ─── Warning detection ────────────────────────────────────────────────────────

function detectWarnings(
  _files: FileMetadata[],
  parsedList: (ParsedFilename | null)[]
): SessionWarning[] {
  const warnings: SessionWarning[] = [];

  // Detect missing segments by looking for skipped sequence numbers
  const seqs = parsedList
    .filter((p): p is ParsedFilename => p !== null)
    .map((p) => p.sequence);

  if (seqs.length > 1) {
    for (let i = 1; i < seqs.length; i++) {
      if (seqs[i] - seqs[i - 1] > 1) {
        warnings.push({
          type: 'missing-segment',
          message: `Possible missing segment between clip ${i} and ${i + 1} (sequence gap: ${seqs[i - 1]} → ${seqs[i]}).`,
        });
      }
    }
  }

  return warnings;
}

/**
 * Compute warnings that require ffprobe data (codec/resolution/fps mismatches).
 * Call this after probing clips and update the session accordingly.
 */
export function detectProbeWarnings(clips: ClipInfo[]): SessionWarning[] {
  const warnings: SessionWarning[] = [];
  const probed = clips.filter((c) => c.probeStatus === 'done');
  if (probed.length < 2) return warnings;

  const codecs = new Set(probed.map((c) => c.codec).filter(Boolean));
  if (codecs.size > 1) {
    warnings.push({
      type: 'codec-mismatch',
      message: `Clips use different video codecs (${[...codecs].join(', ')}). Fast merge may fail — use Compatibility mode.`,
    });
  }

  const resolutions = new Set(
    probed
      .filter((c) => c.width && c.height)
      .map((c) => `${c.width}x${c.height}`)
  );
  if (resolutions.size > 1) {
    warnings.push({
      type: 'resolution-mismatch',
      message: `Clips have different resolutions (${[...resolutions].join(', ')}). Fast merge may produce a corrupted output.`,
    });
  }

  const fpsList = new Set(probed.map((c) => c.fps?.toFixed(2)).filter(Boolean));
  if (fpsList.size > 1) {
    warnings.push({
      type: 'fps-mismatch',
      message: `Clips have different frame rates (${[...fpsList].join(', ')} fps). Compatibility mode is recommended.`,
    });
  }

  return warnings;
}

/** Merge two sessions into one (clips from second appended to first). */
export function mergeSessions(a: Session, b: Session): Session {
  return {
    ...a,
    clips: [...a.clips, ...b.clips],
    warnings: [...a.warnings],
    outputFilename: a.outputFilename,
  };
}

/** Split a session at a clip index — clips[0..index] stay, clips[index..] become new session. */
export function splitSessionAt(session: Session, index: number): [Session, Session] {
  const aClips = session.clips.slice(0, index);
  const bClips = session.clips.slice(index);

  const a: Session = {
    ...session,
    id: nextId(),
    clips: aClips,
    outputFilename: `${session.outputFilename.replace(/\.mp4$/i, '')}_1.mp4`,
  };

  const b: Session = {
    ...session,
    id: nextId(),
    clips: bClips,
    name: session.name + ' (part 2)',
    outputFilename: `${session.outputFilename.replace(/\.mp4$/i, '')}_2.mp4`,
  };

  return [a, b];
}
