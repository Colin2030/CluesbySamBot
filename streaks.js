// streaks.js
import { getSheetsClient } from "./sheetsClient.js";

function londonISO(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`; // YYYY-MM-DD
}

function addDaysISO(iso, deltaDays) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function uniqueSorted(dates) {
  return [...new Set(dates)].sort(); // YYYY-MM-DD sorts lexicographically OK
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

  return {
    headers: rows[0].map((h) => String(h || "").trim()),
    data: rows.slice(1),
  };
}

function headerIndex(headers, name) {
  const i = headers.indexOf(name);
  if (i < 0) throw new Error(`Sheet missing required header: ${name}`);
  return i;
}

function computeBestStreak(datesSorted) {
  // datesSorted: array of unique YYYY-MM-DD strings
  if (datesSorted.length === 0) return 0;

  let best = 1;
  let run = 1;

  for (let i = 1; i < datesSorted.length; i++) {
    const prev = datesSorted[i - 1];
    const expected = addDaysISO(prev, 1);
    if (datesSorted[i] === expected) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

function computeCurrentStreak(datesSorted, todayISO) {
  // current streak counts consecutive days ending at:
  // - today if played today, else
  // - yesterday if played yesterday, else 0
  if (datesSorted.length === 0) return { current: 0, lastPlayed: null, playedToday: false };

  const lastPlayed = datesSorted[datesSorted.length - 1];
  const yesterday = addDaysISO(todayISO, -1);

  const playedToday = lastPlayed === todayISO;

  let anchor = null;
  if (lastPlayed === todayISO) anchor = todayISO;
  else if (lastPlayed === yesterday) anchor = yesterday;
  else return { current: 0, lastPlayed, playedToday: false };

  // Walk backwards from anchor and count consecutive days
  let current = 1;
  let cursor = anchor;

  // Use a Set for O(1) membership
  const set = new Set(datesSorted);

  while (true) {
    const prev = addDaysISO(cursor, -1);
    if (set.has(prev)) {
      current += 1;
      cursor = prev;
    } else {
      break;
    }
  }

  return { current, lastPlayed, playedToday };
}

export async function buildCluesStreakMessage(telegramUserId, fallbackName = "You") {
  const { headers, data } = await readAllRows();
  if (headers.length === 0) return "No scores logged yet.";

  const iDate = headerIndex(headers, "puzzleDateISO");
  const iUser = headerIndex(headers, "telegramUserId");

  const dates = [];
  for (const row of data) {
    if (String(row[iUser] || "").trim() !== String(telegramUserId)) continue;
    const d = String(row[iDate] || "").trim();
    if (d) dates.push(d);
  }

  const today = londonISO();
  const datesSorted = uniqueSorted(dates);

  const best = computeBestStreak(datesSorted);
  const { current, lastPlayed, playedToday } = computeCurrentStreak(datesSorted, today);

  const title = `🔥 Clues by Sam — Streaks`;
  const nameLine = `👤 ${fallbackName}`;
  const playedLine = playedToday ? `✅ Played today (${today})` : `⏳ Not played yet today (${today})`;
  const lastLine = lastPlayed ? `📅 Last played: ${lastPlayed}` : `📅 Last played: never`;

  const currentLine = current > 0
    ? `🔥 Current streak: *${current}* day${current === 1 ? "" : "s"}`
    : `🔥 Current streak: *0* (start one today!)`;

  const bestLine = best > 0
    ? `🏅 Best streak: *${best}* day${best === 1 ? "" : "s"}`
    : `🏅 Best streak: *0*`;

  return [
    title,
    "",
    nameLine,
    playedLine,
    lastLine,
    "",
    currentLine,
    bestLine,
  ].join("\n");
}
