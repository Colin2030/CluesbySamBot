// cluesWeek.js
import { getSheetsClient } from "./sheetsClient.js";

function todayInLondon() {
  return new Date(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  );
}

// ISO week (Mon–Sun)
function startOfISOWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7; // Sun=7
  if (day !== 1) d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfISOWeek(start) {
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  return d;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function medal(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `${i + 1}.`;
}

export async function buildCluesWeekMessage() {
  const sheetId = process.env.CLUES_SHEET_ID;
  const tabName = process.env.CLUES_SHEET_TAB || "Submissions";

  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:Z`,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return "No scores logged yet.";

  const headers = rows[0];
  const idx = (name) => headers.indexOf(name);

  const iDate = idx("puzzleDateISO");
  const iUser = idx("telegramUserId");
  const iUserName = idx("telegramUsername");
  const iDisplay = idx("displayName");
  const iTotal = idx("totalScore");

  const today = todayInLondon();
  const start = startOfISOWeek(today);
  const end = endOfISOWeek(start);

  const totals = new Map();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const d = new Date(row[iDate]);
    if (d < start || d > end) continue;

    const userId = row[iUser];
    const score = Number(row[iTotal]);
    if (!Number.isFinite(score)) continue;

    const name =
      row[iDisplay] ||
      row[iUserName] ||
      `User ${userId}`;

    totals.set(userId, {
      name,
      score: (totals.get(userId)?.score || 0) + score,
    });
  }

  if (totals.size === 0) {
    return `📆 Clues by Sam — This Week\nNo scores yet.`;
  }

  const sorted = [...totals.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
	
const gap =
  sorted.length > 1
    ? Math.round(sorted[0].score - sorted[1].score)
    : null;

  const lines = [];
  lines.push(
    `📆 Clues by Sam — This Week`,
    `(${toISODate(start)} → ${toISODate(end)})`,
    ""
  );

  sorted.forEach((e, i) => {
  let flair = "";
  if (i === 0) flair = " 👑";
  lines.push(`${medal(i)} ${e.name} — ${Math.round(e.score)}${flair}`);
});


  return lines.join("\n");
}