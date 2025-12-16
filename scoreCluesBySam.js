// scoreCluesBySam.js
// ES modules (matches your "type": "module")

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round(n) {
  return Math.round(n);
}

function difficultyMultiplier(difficultyRaw) {
  const d = (difficultyRaw || "").trim().toLowerCase();
  if (d === "hard") return 1.2;
  if (d === "medium") return 1.1;
  if (d === "easy") return 1.0;
  return 1.0; // default if unknown/missing
}

function estimateSecondsFromBand(timeBandMinutes) {
  // midpoint-ish estimates to reduce gaming while staying fair
  const m = Number(timeBandMinutes);
  if (!Number.isFinite(m) || m <= 0) return null;

  // common bands: 5, 10, 15
  if (m <= 5) return 4 * 60 + 30;     // 4:30
  if (m <= 10) return 9 * 60;         // 9:00
  if (m <= 15) return 13 * 60 + 30;   // 13:30

  // fallback: assume 90% of the stated band
  return round(m * 60 * 0.9);
}

/**
 * Score a parsed Clues by Sam submission.
 *
 * @param {object} parsed Output of parseCluesBySamSubmission()
 * @returns {{
 *  total: number,
 *  base: number,
 *  qualityScore: number,
 *  speedScore: number|null,
 *  difficultyMultiplier: number,
 *  effectiveTimeSeconds: number|null,
 *  breakdown: {
 *    greens: number, clues: number, retries: number, tiles: number,
 *    qualityRatio: number,
 *    speedCapSeconds: number,
 *    hasExactTime: boolean,
 *    usedBandTime: boolean
 *  },
 *  notes: string[]
 * }}
 */
export function scoreCluesBySam(parsed) {
  const notes = [];

  const greens = parsed?.tiles?.green ?? 0;
  const clues = parsed?.tiles?.clue ?? 0;
  const retries = parsed?.tiles?.retry ?? 0;
  const tiles = parsed?.tiles?.total ?? (greens + clues + retries);

  if (!Number.isFinite(tiles) || tiles <= 0) {
    return {
      total: 0,
      base: 0,
      qualityScore: 0,
      speedScore: null,
      difficultyMultiplier: difficultyMultiplier(parsed?.difficulty),
      effectiveTimeSeconds: null,
      breakdown: {
        greens, clues, retries, tiles: 0,
        qualityRatio: 0,
        speedCapSeconds: 20 * 60,
        hasExactTime: false,
        usedBandTime: false,
      },
      notes: ["No tiles found; cannot score."],
    };
  }

  // ---- Quality (0–100) ----
  // weights: green 1.0, clue 0.7, retry 0.4
  const qualityRatioRaw = (1.0 * greens + 0.7 * clues + 0.4 * retries) / tiles;
  const qualityRatio = clamp(qualityRatioRaw, 0, 1);
  const qualityScore = round(100 * qualityRatio);

  // ---- Speed (0–100) ----
  // cap at 20 minutes, linear
  const speedCapSeconds = 20 * 60;

  let effectiveTimeSeconds = null;
  let hasExactTime = false;
  let usedBandTime = false;

  if (Number.isFinite(parsed?.timeSeconds) && parsed.timeSeconds >= 0) {
    effectiveTimeSeconds = parsed.timeSeconds;
    hasExactTime = true;
  } else if (Number.isFinite(parsed?.timeBandMinutes) && parsed.timeBandMinutes > 0) {
    effectiveTimeSeconds = estimateSecondsFromBand(parsed.timeBandMinutes);
    usedBandTime = effectiveTimeSeconds != null;
    if (usedBandTime) notes.push(`Time estimated from “<${parsed.timeBandMinutes} minutes”.`);
  } else {
    notes.push("No time provided; speed score omitted.");
  }

  let speedScore = null;
  if (effectiveTimeSeconds != null) {
    const clamped = Math.min(effectiveTimeSeconds, speedCapSeconds);
    const speedRatio = 1 - (clamped / speedCapSeconds);
    speedScore = round(100 * clamp(speedRatio, 0, 1));
  }

  // ---- Combine (base up to 200) ----
  // Slightly favour quality over speed
  let base;
  if (speedScore == null) {
    base = round(qualityScore * 1.2); // max 120
  } else {
    base = round(qualityScore * 1.2 + speedScore * 0.8); // max 200
  }

  // ---- Difficulty multiplier ----
  const mult = difficultyMultiplier(parsed?.difficulty);
  const total = round(base * mult);

  return {
    total,
    base,
    qualityScore,
    speedScore,
    difficultyMultiplier: mult,
    effectiveTimeSeconds,
    breakdown: {
      greens,
      clues,
      retries,
      tiles,
      qualityRatio,
      speedCapSeconds,
      hasExactTime,
      usedBandTime,
    },
    notes,
  };
}
