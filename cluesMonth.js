// cluesMonth.js
import { getSheetsClient } from "./sheetsClient.js";

function medal(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `${i + 1}.`;
}

export async function buildCluesMonthMessage() {
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

  const now = new Date(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
    }).format(new Date()) + "-01"
  );

  const month = now.getMonth();
  const year = now.getFullYear();

  const totals = new Map();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const d = new Date(row[iDate]);
    if (d.getMonth() !== month || d.getFullYear() !== year) continue;

    const userId = row[iUser];
    const score = Number(row[iTotal]);
    if (!Number.isFinite(score)) continue;

    const name =
      row[iUserName] ||
      row[iDisplay] ||
      `User ${userId}`;

    totals.set(userId, {
      name,
      score: (totals.get(userId)?.score || 0) + score,
    });
  }

  if (totals.size === 0) {
    return `🗓️ Clues by Sam — This Month\nNo scores yet.`;
  }

  const sorted = [...totals.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const label = now.toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });

  const lines = [];
  lines.push(`🗓️ Clues by Sam — ${label}`, "");

  sorted.forEach((e, i) => {
    lines.push(`${medal(i)} ${e.name} — ${Math.round(e.score)}`);
  });

  return lines.join("\n");
}
