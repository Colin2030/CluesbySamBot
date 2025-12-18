import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import { scoreCluesBySam } from "./scoreCluesBySam.js";
import { parseCluesBySamSubmission } from "./utils/parseCluesBySamSubmission.js";
import { saveCluesSubmission } from "./saveCluesSubmission.js";
import { buildCluesTodayMessage } from "./cluesToday.js";
import { buildCluesWeekMessage } from "./cluesWeek.js";
import { buildCluesMonthMessage } from "./cluesMonth.js";
import { registerCronJobs } from "./cronJobs.js";
import { buildCluesStreakMessage } from "./streaks.js";
import { londonISO } from "./timeLondon.js";
import { buildDailyLeaderboard } from "./leaderboards.js";
import { generateCluesComment } from "./aiCommentary.js";

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
//...
registerCronJobs(bot);

app.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

function escapeMarkdown(s = "") {
  // Telegram Markdown (not V2) minimal escaping
  return String(s).replace(/[_*`\[]/g, "\\$&");
}

function buildWelcomeMessage(firstName) {
  const name = escapeMarkdown(firstName || "pal");
  return (
`*Well now… look what the cat dragged in.*

Welcome to the joint, *${name}*.

This is where our logic is stressed and guesses get put under the lamp. Every day there's a new case — and nobody gets out clean.

Here's how it works, kid:
• You crack the daily puzzle
• You post your results — no alibis, no disappearing acts
• I keep the books, the scores, and the grudges

Just type /help if need me. I'm always here, I never sleep.

Do well and you'll earn a reputation.
Do badly and… well, we've all had nights like that.

Streaks matter. Consistency matters more.
And the clock? The clock is always watching.

When you're ready, post today's result and let's see what you're made of.

*Now grab a chair. The city never sleeps — and neither does this puzzle.*`
  );
}


bot.on("message", async (msg) => {
	
	// Commands (group only)
if (String(msg.chat.id) === String(process.env.GROUP_CHAT_ID)) {
  const text = (msg.text ?? "").trim();
  
 if (/^\/clues_week(@\w+)?$/i.test(text)) {
  await bot.sendMessage(msg.chat.id, await buildCluesWeekMessage());
  return;
}

if (/^\/clues_month(@\w+)?$/i.test(text)) {
  await bot.sendMessage(msg.chat.id, await buildCluesMonthMessage());
  return;
}

if (/^\/clues_streak(@\w+)?$/i.test(text)) {
  const display =
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") ||
    (msg.from?.username && `@${msg.from.username}`) ||
    "You";

  const message = await buildCluesStreakMessage(msg.from.id, display);
  await bot.sendMessage(msg.chat.id, message, { disable_web_page_preview: true });
  return;
}

if (/^\/ping(@\w+)?$/i.test(text)) {
  await bot.sendMessage(
    msg.chat.id,
    `🚬 *Still here, pal.*\n\nThe lights are on and the coffee's cold — just how I like it.`,
    { parse_mode: "Markdown" }
  );
  return;
}

if (/^\/help(@\w+)?$/i.test(text)) {
  const helpText = `🕵️ *Clues by Sam Bot — Commands*

*Daily Puzzle:*
Just post your Clues by Sam result and I'll log it automatically.

*Commands:*
/clues_today — Today's leaderboard
/clues_week — This week's leaderboard
/clues_month — This month's leaderboard
/clues_streak — Your current streak
/scoring — How the scoring works
/help — Show this message
/ping — Check if the bot is alive

*How it works:*
• Solve the daily puzzle at cluesbysam.com
• Post your result in this chat
• I'll score it and update the leaderboards
• Build streaks by playing consecutive days
• Compete for daily, weekly, and monthly glory

*The clock never stops. Neither should you.*`;

  await bot.sendMessage(msg.chat.id, helpText, { 
    parse_mode: "Markdown",
    disable_web_page_preview: true 
  });
  return;
}

if (/^\/scoring(@\w+)?$/i.test(text)) {
  const scoringText = `🎯 *Clues by Sam — Scoring System*

Your score is calculated from your puzzle performance:

*Base Points (max 200):*
• 🟩 Green tiles: +10 each
• 🟡 Clues used: -5 each
• 🟨 Retries: -10 each

*Time Bonus (max 50):*
• Under 2 min: +50
• Under 3 min: +40
• Under 4 min: +30
• Under 5 min: +20
• Under 7 min: +10
• 7+ min: +0

*Difficulty Multiplier:*
• Easy: ×0.8
• Medium: ×1.0
• Hard: ×1.2
• Expert: ×1.5

*Final Score = (Base + Time Bonus) × Difficulty*

*Pro tips:*
• Fewer clues = higher score
• Speed matters (but accuracy more)
• Harder puzzles = bigger multipliers
• No retries = maximum points

*Now get out there and show me what you've got.*`;

  await bot.sendMessage(msg.chat.id, scoringText, { 
    parse_mode: "Markdown",
    disable_web_page_preview: true 
  });
  return;
}

  // Welcome new members
  if (String(msg.chat.id) === String(process.env.GROUP_CHAT_ID) && Array.isArray(msg.new_chat_members)) {
    for (const member of msg.new_chat_members) {
      // Skip bots (including ourselves)
      if (member.is_bot) continue;

      await bot.sendMessage(
        msg.chat.id,
        buildWelcomeMessage(member.first_name),
        { parse_mode: "Markdown", disable_web_page_preview: true }
      );
    }
    return; // don't also treat the join message as a command/submission
  }

  // Support "/clues_today" and "/clues_today@YourBot"
 if (/^\/clues_today(@\w+)?$/i.test(text)) {
    const message = await buildCluesTodayMessage();
    await bot.sendMessage(msg.chat.id, message);
    return;
  }
}

  if (String(msg.chat.id) !== String(process.env.GROUP_CHAT_ID)) return;

  const parsed = parseCluesBySamSubmission(msg.text ?? "");
  if (!parsed) return;

  const scored = scoreCluesBySam(parsed);
  
  const result = await saveCluesSubmission(parsed, scored, msg);

if (!result.saved) {
  await bot.sendMessage(
    msg.chat.id,
    `🚬 I've heard this story already — ${parsed.puzzleDateISO}.
First confession stands. Changing it now would just make things worse.`
  );
  return;
}


// ---- Polished submission response with GPT commentary ----

const todayISO = londonISO();

// Build today's leaderboard to determine rank
const lb = await buildDailyLeaderboard(todayISO);
let rank = null;

if (lb?.entries?.length) {
  const idx = lb.entries.findIndex(
    (e) => String(e.userId) === String(msg.from.id)
  );
  if (idx >= 0) rank = idx + 1;
}

const rankText = rank ? `#${rank}/${lb.entries.length}` : "unranked";

const playerName =
  [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") ||
  (msg.from?.username && `@${msg.from.username}`) ||
  "Someone mysterious";

const timeText =
  scored.effectiveTimeSeconds != null
    ? `${Math.floor(scored.effectiveTimeSeconds / 60)}:${String(
        scored.effectiveTimeSeconds % 60
      ).padStart(2, "0")}${scored.breakdown.usedBandTime ? " (est.)" : ""}`
    : parsed.timeBandMinutes
      ? `<${parsed.timeBandMinutes}m`
      : "n/a";

// Normalise score to 0–1 for tone selection
const scorePct = Math.max(0, Math.min(1, scored.base / 200));

const comment = await generateCluesComment({
  playerName,
  scorePct,
  difficulty: parsed.difficulty,
  greens: scored.breakdown.greens,
  clues: scored.breakdown.clues,
  retries: scored.breakdown.retries,
  timeText,
  rankText,
});

await bot.sendMessage(
  msg.chat.id,
  `🧩 *Clues by Sam* — ${parsed.puzzleDateISO} (${parsed.difficulty ?? "?"})

🏁 *Score:* ${scored.total}  •  *Today:* ${rankText}
🟩 ${scored.breakdown.greens}  🟡 ${scored.breakdown.clues}  🟨 ${scored.breakdown.retries}   ⏱️ ${timeText}

_${comment}_`,
  {
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  }
);

});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});