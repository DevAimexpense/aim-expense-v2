// ===========================================
// Text Similarity Utilities
// Used for fuzzy-matching OCR-extracted names against known references
// (e.g. payee list, org/buyer config) to recover from common Thai OCR
// confusions (ร↔ซ, ด↔อ, ไม้หันอากาศ↔สระอะ, missing tone marks).
// ===========================================

/** Strip whitespace, lowercase, normalize unicode (NFC). */
function normalize(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

/** Strip common Thai company prefixes/suffixes that are often mis-OCR'd. */
function stripCompanyAffixes(s: string): string {
  return s
    .replace(/^บริษัท\s*/u, "")
    .replace(/^บจก\.?\s*/iu, "")
    .replace(/^หจก\.?\s*/iu, "")
    .replace(/^ห้างหุ้นส่วนจำกัด\s*/u, "")
    .replace(/^company\s+/i, "")
    .replace(/\s*จำกัด\s*\(.*\)\s*$/u, "")
    .replace(/\s*จำกัด\s*$/u, "")
    .replace(/\s*\(มหาชน\)\s*$/u, "")
    .replace(/\s*co\.?,?\s*ltd\.?\s*$/i, "")
    .replace(/\s*ltd\.?\s*$/i, "")
    .replace(/\s*limited\s*$/i, "")
    .trim();
}

/** Levenshtein edit distance — number of single-char edits to transform a → b. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // 2-row dynamic programming for memory efficiency.
  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  let curr = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insertion
        prev[j] + 1,          // deletion
        prev[j - 1] + cost,   // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Similarity score in [0, 1] based on Levenshtein distance.
 * 1.0 = identical, 0.0 = completely different.
 *
 * Both inputs are normalized + company affixes stripped before comparison
 * so that "บริษัท อาร์โด จำกัด" and "อาร์โด" score very high.
 */
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const aN = stripCompanyAffixes(normalize(a));
  const bN = stripCompanyAffixes(normalize(b));
  if (!aN || !bN) return 0;
  if (aN === bN) return 1;

  const dist = levenshtein(aN, bN);
  const maxLen = Math.max(aN.length, bN.length);
  return 1 - dist / maxLen;
}

export interface FuzzyMatchOptions {
  /** Minimum similarity to accept the match (0..1). Default 0.7 */
  threshold?: number;
}

export interface FuzzyMatchResult<T> {
  item: T;
  score: number;
}

/**
 * Pick the best fuzzy match from a list. Returns null if best score is below threshold.
 */
export function findBestMatch<T>(
  query: string | null | undefined,
  list: readonly T[],
  getCandidate: (item: T) => string | null | undefined,
  options: FuzzyMatchOptions = {},
): FuzzyMatchResult<T> | null {
  const threshold = options.threshold ?? 0.7;
  if (!query) return null;

  let best: FuzzyMatchResult<T> | null = null;
  for (const item of list) {
    const candidate = getCandidate(item);
    if (!candidate) continue;
    const score = similarity(query, candidate);
    if (!best || score > best.score) {
      best = { item, score };
    }
  }

  return best && best.score >= threshold ? best : null;
}
