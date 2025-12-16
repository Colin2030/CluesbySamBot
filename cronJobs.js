// cronJobs.js
import cron from "node-cron";
import {
  buildDailyLeaderboard,
  buildRangeLeaderboard,
  getYesterdayISO,
  getLastWeekRangeISO,
  getLastMonthRangeISO,
} from "./leaderboards.js";

function safeName(winner) {
  return winner?.name ?? "No-one (yet!)";
}

export function registerCronJobs(bot) {
  const groupId = process.env.GROUP_CHAT_ID;
  if (!groupId) {
    console.warn("No GROUP_CHAT_ID set; cron jobs will not post.");
    return;
  }

  const post = async (text) => {
    await bot.sendMessage(groupId, text, { disable_web_page_preview: true });
  };

  // 1) Daily at 08:00 London — yesterday’s winner + leaderboard
  cron.schedule(
    "0 8 * * *",
    async () => {
      try {
        const y = getYesterdayISO();
        const lb = await buildDailyLeaderboard(y);

        if (!lb.winner) {
          await post(`🌅 *Daily Clues by Sam* (${y})\n\nNo scores logged yesterday — who’s breaking the streak today? 😏`);
          return;
        }

        await post(
          `🌅 Daily Clues by Sam — *Yesterday’s Winner*\n` +
          `📅 ${y}\n\n` +
          `🏆 Winner: *${safeName(lb.winner)}* — ${Math.round(lb.winner.score)}\n\n` +
          `📋 Leaderboard:\n${lb.message}\n\n` +
          `🧠 Back at it today, team!`
        );
      } catch (e) {
        console.error("Daily cron failed:", e);
      }
    },
    { timezone: "Europe/London" }
  );

  // 2) Weekly at 09:00 London every Monday — last week’s winner + leaderboard
  cron.schedule(
    "0 9 * * 1",
    async () => {
      try {
        const { startISO, endISO } = getLastWeekRangeISO();
        const lb = await buildRangeLeaderboard(startISO, endISO, 10);

        if (!lb.winner) {
          await post(`📆 Weekly Clues by Sam (${startISO} → ${endISO})\n\nNo scores logged last week — fresh start! ✨`);
          return;
        }

        await post(
          `📆 Weekly Clues by Sam — *Last Week’s Champion*\n` +
          `🗓️ ${startISO} → ${endISO}\n\n` +
          `🏆 Champion: *${safeName(lb.winner)}* — ${Math.round(lb.winner.score)}\n\n` +
          `📋 Top 10:\n${lb.message}\n\n` +
          `🔥 New week, new rivalry.`
        );
      } catch (e) {
        console.error("Weekly cron failed:", e);
      }
    },
    { timezone: "Europe/London" }
  );

  // 3) Monthly at 10:00 London on the 1st — last month’s winner + leaderboard
  cron.schedule(
    "0 10 1 * *",
    async () => {
      try {
        const { startISO, endISO, label } = getLastMonthRangeISO();
        const lb = await buildRangeLeaderboard(startISO, endISO, 10);

        if (!lb.winner) {
          await post(`🗓️ Monthly Clues by Sam — ${label}\n\nNo scores logged last month — let’s change that! 💪`);
          return;
        }

        await post(
          `🗓️ Monthly Clues by Sam — *${label} Winner*\n` +
          `🏆 Winner: *${safeName(lb.winner)}* — ${Math.round(lb.winner.score)}\n\n` +
          `📋 Top 10:\n${lb.message}\n\n` +
          `🎉 New month starts now. Who’s taking the crown next?`
        );
      } catch (e) {
        console.error("Monthly cron failed:", e);
      }
    },
    { timezone: "Europe/London" }
  );

  console.log("✅ Cron jobs registered (Europe/London).");
}
