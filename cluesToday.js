// cluesToday.js
import { getSheetsClient } from "./sheetsClient.js";

function todayISOInLondon() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`; // YYYY-MM-DD
}

function medal(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `${i + 1}.`;
}

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export async function buildCluesTodayMessage() {
  const sheetId = process.env.CLUES_SHEET_ID;
  if (!sheetId) throw new Error("Missing CLUES_SHEET_ID");

  const tabName = process.env.CLUES_SHEET_TAB || "Submissions";
  const sheets = await getSheetsClient();

  // Read all rows (header + data). Fine for v1.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:Z`,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) {
    return "No data found in the sheet yet.";
  }

  const headers = rows[0].map((h) => String(h || "").trim());
  const idx = (name) => headers.indexOf(name);

  const iDate = idx("puzzleDateISO");
  const iUser = idx("telegramUserId");
  const iUserName = idx("telegramUsername");
  const iDisplay = idx("displayName");
  const iTotal = idx("totalScore");
  const iDiff = idx("difficulty");

  if ([iDate, iUser, iTotal].some((i) => i < 0)) {
    return `Sheet headers missing. Need at least: puzzleDateISO, telegramUserId, totalScore.`;
  }

  const today = todayISOInLondon();

  const entries = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (String(row[iDate] || "").trim() !== today) continue;

    const total = toNumber(row[iTotal]);
    if (total == null) continue;

    const displayName = String(row[iDisplay] || "").trim();
    const username = String(row[iUserName] || "").trim();
    const userLabel = displayName || username || `User ${row[iUser]}`;

    const difficulty = iDiff >= 0 ? String(row[iDiff] || "").trim() : "";

    entries.push({
      userLabel,
      total,
      difficulty,
    });
  }

  if (entries.length === 0) {
    return `📅 Clues by Sam — Today (${today})\n\nNo scores logged yet.`;
  }

  // Sort: highest score first; tie-break by name for stability
  entries.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.userLabel.localeCompare(b.userLabel);
  });

  const top = entries.slice(0, 10);

  const lines = [];
  lines.push(`📅 Clues by Sam — Today (${today})`);
  lines.push(`Players: ${entries.length}`);
  lines.push("");

  for (let i = 0; i < top.length; i++) {
    const e = top[i];
    const diff = e.difficulty ? ` (${e.difficulty})` : "";
    lines.push(`${medal(i)} ${e.userLabel}${diff} — ${e.total}`);
  }

  if (entries.length > top.length) {
    lines.push("");
    lines.push(`…and ${entries.length - top.length} more`);
  }

  return lines.join("\n");
}