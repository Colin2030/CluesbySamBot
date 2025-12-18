// leaderboards.js
import { getSheetsClient } from "./sheetsClient.js";

function medal(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `${i + 1}.`;
}

function londonParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { y: get("year"), m: get("month"), d: get("day") };
}

function londonISO(date = new Date()) {
  const { y, m, d } = londonParts(date);
  return `${y}-${m}-${d}`;
}

function addDaysLondonISO(isoDate, deltaDays) {
  // isoDate is YYYY-MM-DD (we treat it as a date label)
  const [y, m, d] = isoDate.split("-").map(Number);
  // Create a UTC date from the components then shift days; we only use the resulting Y-M-D label
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function startOfISOWeekFromISO(isoDate) {
  // isoDate as YYYY-MM-DD; treat as a date label
  const dt = new Date(`${isoDate}T00:00:00Z`);
  const day = dt.getUTCDay() || 7; // Sun=7
  const start = new Date(dt);
  start.setUTCDate(start.getUTCDate() - (day - 1)); // back to Monday
  return start.toISOString().slice(0, 10);
}

function endOfISOWeekFromISO(mondayISO) {
  return addDaysLondonISO(mondayISO, 6);
}

function monthLabel(isoDate) {
  const [y, m] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" });
}

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function readAllRows() {
  const sheetId = process.env.CLUES_SHEET_ID;
  if (!sheetId) throw new Error("Missing CLUES_SHEET_ID");

  const tabName = process.env.CLUES_SHEET_TAB || "Submissions";

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:Z`,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return { headers: [], data: [] };

  const headers = rows[0].map((h) => String(h || "").trim());
  const data = rows.slice(1);

  return { headers, data };
}

function headerIndex(headers, name) {
  const i = headers.indexOf(name);
  if (i < 0) throw new Error(`Sheet missing required header: ${name}`);
  return i;
}

function formatLeaderboard(entries, topN = 10) {
  const sorted = [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  const top = sorted.slice(0, topN);

  const lines = top.map((e, i) => `${medal(i)} ${e.name} — ${Math.round(e.score)}`);

  if (sorted.length > top.length) {
    lines.push(`…and ${sorted.length - top.length} more`);
  }

  return { sorted, top, lines: lines.join("\n") };
}

/**
 * Daily leaderboard for a specific date (YYYY-MM-DD):
 * Uses the *single* daily totalScore row per user.
 */
export async function buildDailyLeaderboard(isoDate) {
  const { headers, data } = await readAllRows();
  if (headers.length === 0) return { isoDate, entries: [], message: "No data found." };

  const iDate = headerIndex(headers, "puzzleDateISO");
  const iUser = headerIndex(headers, "telegramUserId");
  const iUserName = headers.indexOf("telegramUsername");
  const iDisplay = headers.indexOf("displayName");
  const iTotal = headerIndex(headers, "totalScore");
  const iDiff = headers.indexOf("difficulty");

  const entries = [];

  for (const row of data) {
    if (String(row[iDate] || "").trim() !== isoDate) continue;

    const score = toNumber(row[iTotal]);
    if (score == null) continue;

    const userId = row[iUser];
    const name = (iDisplay >= 0 && row[iDisplay]) || (iUserName >= 0 && row[iUserName]) || `User ${userId}`;
    const difficulty = iDiff >= 0 ? String(row[iDiff] || "").trim() : "";

    entries.push({ userId, name, score, difficulty });
  }

  const { sorted, top, lines } = formatLeaderboard(entries, 10);

  return {
    isoDate,
    entries: sorted,
    winner: top[0] ?? null,
    message: lines,
  };
}

/**
 * Aggregate leaderboard across a date range inclusive.
 * Sums totalScore per user across multiple days.
 */
export async function buildRangeLeaderboard(startISO, endISO, topN = 10) {
  const { headers, data } = await readAllRows();
  if (headers.length === 0) return { startISO, endISO, entries: [], message: "No data found." };

  const iDate = headerIndex(headers, "puzzleDateISO");
  const iUser = headerIndex(headers, "telegramUserId");
  const iUserName = headers.indexOf("telegramUsername");
  const iDisplay = headers.indexOf("displayName");
  const iTotal = headerIndex(headers, "totalScore");

  const totals = new Map();

  for (const row of data) {
    const date = String(row[iDate] || "").trim();
    if (!date) continue;
    if (date < startISO || date > endISO) continue;

    const score = toNumber(row[iTotal]);
    if (score == null) continue;

    const userId = String(row[iUser] || "").trim();
    const name = (iDisplay >= 0 && row[iDisplay]) || (iUserName >= 0 && row[iUserName]) || `User ${userId}`;

    const prev = totals.get(userId);
    totals.set(userId, { userId, name, score: (prev?.score ?? 0) + score });
  }

  const entries = [...totals.values()];
  const { sorted, top, lines } = formatLeaderboard(entries, topN);

  return {
    startISO,
    endISO,
    entries: sorted,
    winner: top[0] ?? null,
    message: lines,
  };
}

// Helpers for cron schedules:

export function getYesterdayISO() {
  return addDaysLondonISO(londonISO(), -1);
}

export function getLastWeekRangeISO() {
  // If today is Monday, we announce the *previous* week (Mon–Sun).
  const today = londonISO();
  const thisMonday = startOfISOWeekFromISO(today);
  const lastMonday = addDaysLondonISO(thisMonday, -7);
  const lastSunday = endOfISOWeekFromISO(lastMonday);
  return { startISO: lastMonday, endISO: lastSunday };
}

export function getLastMonthRangeISO() {
  // Use London "today" label, then compute previous month boundaries.
  const today = londonISO();
  const [y, m] = today.split("-").map(Number);

  const firstThisMonth = new Date(Date.UTC(y, m - 1, 1));
  const firstLastMonth = new Date(Date.UTC(y, m - 2, 1));
  const lastLastMonth = new Date(Date.UTC(y, m - 1, 0)); // day 0 of this month = last day prev month

  const startISO = firstLastMonth.toISOString().slice(0, 10);
  const endISO = lastLastMonth.toISOString().slice(0, 10);

  return { startISO, endISO, label: monthLabel(startISO) };
}