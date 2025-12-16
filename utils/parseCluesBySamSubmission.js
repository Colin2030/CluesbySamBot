// utils/parseCluesBySamSubmission.js
// ES2023+ (works with "type": "module")

const MONTHS = new Map([
  ["jan", 1], ["january", 1],
  ["feb", 2], ["february", 2],
  ["mar", 3], ["march", 3],
  ["apr", 4], ["april", 4],
  ["may", 5],
  ["jun", 6], ["june", 6],
  ["jul", 7], ["july", 7],
  ["aug", 8], ["august", 8],
  ["sep", 9], ["sept", 9], ["september", 9],
  ["oct", 10], ["october", 10],
  ["nov", 11], ["november", 11],
  ["dec", 12], ["december", 12],
]);

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseHumanDateToISO(dateStr) {
  // Accepts "Nov 17th 2025", "November 17 2025", etc.
  // We intentionally ignore the ordinal suffix (st/nd/rd/th).
  const m = dateStr
    .trim()
    .match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/);

  if (!m) return null;

  const monthRaw = m[1].toLowerCase();
  const month = MONTHS.get(monthRaw);
  if (!month) return null;

  const day = Number(m[2]);
  const year = Number(m[3]);

  if (day < 1 || day > 31) return null;

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function isEmojiGridLine(line) {
  // Keep this permissive: some clients add spaces.
  // We only accept lines made of these tiles + optional whitespace.
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Allowed tiles: 🟩 🟨 🟡 (and allow whitespace)
  return /^[\s🟩🟨🟡]+$/.test(trimmed) && /[🟩🟨🟡]/.test(trimmed);
}

function countChars(str, char) {
  // Works fine with these single-codepoint emojis.
  let count = 0;
  for (const c of str) if (c === char) count++;
  return count;
}

/**
 * Parse a Clues by Sam share message.
 *
 * @param {string} text Raw Telegram message text.
 * @returns {null | {
 *   source: "cluesbysam",
 *   puzzleDateISO: string,
 *   difficulty: string | null,
 *   timeSeconds: number | null,
 *   timeBandMinutes: number | null,
 *   grid: { rows: number, cols: number | null, lines: string[] },
 *   tiles: { green: number, clue: number, retry: number, total: number }
 * }}
 */
export function parseCluesBySamSubmission(text) {
  if (typeof text !== "string" || text.trim().length === 0) return null;

  // Quick filter: must mention the site or the known share prefix.
  const looksLikeShare =
    /cluesbysam\.com/i.test(text) ||
    /I solved the daily Clues by Sam/i.test(text);

  if (!looksLikeShare) return null;

  const lines = text.split(/\r?\n/).map(l => l.trimEnd());

  // Typical first line:
  // "I solved the daily Clues by Sam, Nov 17th 2025 (Easy), in less than 10 minutes"
  const headerLine = lines.find(l => /I solved the daily Clues by Sam/i.test(l)) ?? lines[0] ?? "";

  // Extract date
  const dateMatch = headerLine.match(/,\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4})\s*/);
  const puzzleDateISO = dateMatch ? parseHumanDateToISO(dateMatch[1]) : null;
  if (!puzzleDateISO) return null; // date is essential to scoring/streaks

  // Extract difficulty (first (...) after the date)
  const diffMatch = headerLine.match(/\(([^)]+)\)/);
  const difficulty = diffMatch ? diffMatch[1].trim() : null;

  // Extract time
  // Supports:
  // - "in 01:26"
  // - "in 9:59"
  // - "in less than 10 minutes"
  // - "in under 10 minutes"
  let timeSeconds = null;
  let timeBandMinutes = null;

  const mmssMatch = headerLine.match(/\bin\s+(\d{1,2}):(\d{2})\b/);
  if (mmssMatch) {
    const mm = Number(mmssMatch[1]);
    const ss = Number(mmssMatch[2]);
    if (Number.isFinite(mm) && Number.isFinite(ss) && ss >= 0 && ss <= 59) {
      timeSeconds = mm * 60 + ss;
    }
  } else {
    const bandMatch = headerLine.match(/\bin\s+(?:less than|under)\s+(\d{1,2})\s+minutes?\b/i);
    if (bandMatch) {
      const mins = Number(bandMatch[1]);
      if (Number.isFinite(mins) && mins > 0 && mins <= 99) {
        timeBandMinutes = mins;
      }
    }
  }

  // Extract emoji grid lines
  const gridLines = lines.filter(isEmojiGridLine);
  if (gridLines.length === 0) return null; // without grid, we can’t score properly

  // Determine cols (if rectangular)
  const colCounts = gridLines.map(l => {
    // count only tiles, ignore whitespace
    const compact = l.replace(/\s+/g, "");
    return [...compact].filter(ch => ch === "🟩" || ch === "🟨" || ch === "🟡").length;
  });

  const firstCols = colCounts[0] ?? null;
  const cols = colCounts.every(c => c === firstCols) ? firstCols : null;

  const allTiles = gridLines.join("").replace(/\s+/g, "");

  const green = countChars(allTiles, "🟩");
  const clue = countChars(allTiles, "🟡");
  const retry = countChars(allTiles, "🟨");
  const total = green + clue + retry;

  return {
    source: "cluesbysam",
    puzzleDateISO,
    difficulty,
    timeSeconds,
    timeBandMinutes,
    grid: {
      rows: gridLines.length,
      cols,
      lines: gridLines,
    },
    tiles: { green, clue, retry, total },
  };
}
