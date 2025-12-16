// aiCommentary.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function pickTone(scorePct) {
  // scorePct: 0..1
  if (scorePct >= 0.85) return "triumphant, smug-but-likeable, celebratory";
  if (scorePct >= 0.70) return "confident, playful, lightly competitive";
  if (scorePct >= 0.50) return "cheeky encouragement, upbeat";
  if (scorePct >= 0.30) return "gentle roast, motivational";
  return "lightly savage but friendly, never mean";
}

function fallbackComment(scorePct) {
  if (scorePct >= 0.85) return "🚀 Absolute clinic. The clues barely had time to exist.";
  if (scorePct >= 0.70) return "😎 Strong work — that’s a proper tidy solve.";
  if (scorePct >= 0.50) return "👏 Solid! A few bumps, but you brought it home.";
  if (scorePct >= 0.30) return "🫡 We’ve seen worse. Tomorrow: fewer wobbles, more glory.";
  return "🧯 That was… eventful. But hey — a score is a score. Get revenge tomorrow.";
}

export async function generateCluesComment({ playerName, scorePct, difficulty, greens, clues, retries, timeText, rankText }) {
  const model = process.env.OPENAI_MODEL || "gpt-5";
  const tone = pickTone(scorePct);

  // Keep it short, fun, and safe for a group chat.
  const instructions =
    "You write short witty Telegram banter for a daily puzzle leaderboard. " +
    "1-2 sentences max. One emoji max. No swearing, no insults, no personal attacks. " +
    "Reference the player's performance using the provided stats. Make it feel fresh (avoid clichés).";

  const input =
    `Player: ${playerName}\n` +
    `Difficulty: ${difficulty || "?"}\n` +
    `Performance: scorePercent=${Math.round(scorePct * 100)}%\n` +
    `Tiles: greens=${greens}, clues=${clues}, retries=${retries}\n` +
    `Time: ${timeText}\n` +
    `Rank today: ${rankText}\n` +
    `Desired tone: ${tone}\n` +
    `Write the comment now.`;

  try {
    const resp = await client.responses.create({
      model,
      instructions,
      input,
    });

    const text = (resp.output_text || "").trim();
    if (!text) return fallbackComment(scorePct);

    // Safety: ensure it stays short-ish
    return text.split("\n").slice(0, 2).join(" ").slice(0, 220);
  } catch (err) {
    console.error("OpenAI comment failed:", err?.message || err);
    return fallbackComment(scorePct);
  }
}
