// saveCluesSubmission.js
import { getSheetsClient } from "./sheetsClient.js";

const DEFAULT_TAB = "Submissions";

// In-memory guard (cheap). Still backed by Sheets, so safe across restarts.
const seenThisRun = new Set();

const HEADERS = [
  "puzzleDateISO",
  "difficulty",
  "telegramUserId",
  "telegramUsername",
  "displayName",
  "timeSeconds",
  "timeBandMinutes",
  "greens",
  "clues",
  "retries",
  "qualityScore",
  "speedScore",
  "baseScore",
  "difficultyMultiplier",
  "totalScore",
  "submittedAtISO",
];

function keyOf(puzzleDateISO, telegramUserId) {
  return `${puzzleDateISO}::${telegramUserId}`;
}

async function ensureHeaders(sheets, sheetId, tabName) {
  // Read first row
  const range = `${tabName}!A1:Z1`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });

  const row = res.data.values?.[0] ?? [];
  const hasAny = row.some((v) => String(v || "").trim().length > 0);

  if (!hasAny) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
  }
}

async function existsAlready(sheets, sheetId, tabName, puzzleDateISO, telegramUserId) {
  // Fetch columns A (date) and C (telegramUserId)
  // If the sheet grows huge later, we can optimise with a separate index tab.
  const range = `${tabName}!A:C`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });

  const rows = res.data.values ?? [];
  // rows[0] is header
  for (let i = 1; i < rows.length; i++) {
    const date = rows[i]?.[0];
    const userId = rows[i]?.[2];
    if (String(date) === String(puzzleDateISO) && String(userId) === String(telegramUserId)) {
      return true;
    }
  }
  return false;
}

/**
 * Lock-first save: if a user already submitted for that puzzle date, do not overwrite.
 *
 * @param {object} parsed output of parseCluesBySamSubmission
 * @param {object} scored output of scoreCluesBySam
 * @param {object} msg Telegram message object
 */
export async function saveCluesSubmission(parsed, scored, msg) {
  const sheetId = process.env.CLUES_SHEET_ID;
  if (!sheetId) throw new Error("Missing CLUES_SHEET_ID");

  const tabName = process.env.CLUES_SHEET_TAB || DEFAULT_TAB;

  const telegramUserId = msg?.from?.id;
  if (!telegramUserId) throw new Error("Missing msg.from.id (telegramUserId)");

  const telegramUsername = msg?.from?.username ? `@${msg.from.username}` : "";
  const displayName = [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(" ").trim();

  const dedupeKey = keyOf(parsed.puzzleDateISO, telegramUserId);

  // Fast in-memory reject (within this process runtime)
  if (seenThisRun.has(dedupeKey)) {
    return { saved: false, reason: "duplicate_in_memory" };
  }

  const sheets = await getSheetsClient();

  await ensureHeaders(sheets, sheetId, tabName);

  const already = await existsAlready(sheets, sheetId, tabName, parsed.puzzleDateISO, telegramUserId);
  if (already) {
    seenThisRun.add(dedupeKey);
    return { saved: false, reason: "duplicate_in_sheet" };
  }

  const submittedAtISO = new Date().toISOString();

  const row = [
    parsed.puzzleDateISO,
    parsed.difficulty ?? "",
    String(telegramUserId),
    telegramUsername,
    displayName,
    scored.effectiveTimeSeconds ?? "",
    parsed.timeBandMinutes ?? "",
    scored.breakdown.greens,
    scored.breakdown.clues,
    scored.breakdown.retries,
    scored.qualityScore,
    scored.speedScore ?? "",
    scored.base,
    scored.difficultyMultiplier,
    scored.total,
    submittedAtISO,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tabName}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  seenThisRun.add(dedupeKey);

  return { saved: true };
}
