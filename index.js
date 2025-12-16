import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import { scoreCluesBySam } from "./scoreCluesBySam.js";
import { parseCluesBySamSubmission } from "./utils/parseCluesBySamSubmission.js";


const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

app.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});


bot.on("message", (msg) => {
  if (String(msg.chat.id) !== String(process.env.GROUP_CHAT_ID)) return;

  const parsed = parseCluesBySamSubmission(msg.text ?? "");
  if (!parsed) return;

  const scored = scoreCluesBySam(parsed);

  const timeText =
    scored.effectiveTimeSeconds != null
      ? `${Math.floor(scored.effectiveTimeSeconds / 60)}:${String(scored.effectiveTimeSeconds % 60).padStart(2, "0")}${scored.breakdown.usedBandTime ? " (est.)" : ""}`
      : "n/a";

  const noteText = scored.notes.length ? `\nNotes: ${scored.notes.join(" ")}` : "";

  bot.sendMessage(
    msg.chat.id,
    `🏁 Clues by Sam — ${parsed.puzzleDateISO} (${parsed.difficulty ?? "?"})
Score: ${scored.total}  (base ${scored.base} × ${scored.difficultyMultiplier.toFixed(2)})

Quality: ${scored.qualityScore}/100  |  Speed: ${scored.speedScore ?? "n/a"}/100
🟩 ${scored.breakdown.greens}  🟡 ${scored.breakdown.clues}  🟨 ${scored.breakdown.retries}
Time: ${timeText}${noteText}`
  );
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
