import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

app.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

import { parseCluesBySamSubmission } from "./utils/parseCluesBySamSubmission.js";

bot.on("message", (msg) => {
  if (String(msg.chat.id) !== String(process.env.GROUP_CHAT_ID)) return;

  const parsed = parseCluesBySamSubmission(msg.text ?? "");
  if (!parsed) return;

  bot.sendMessage(
    msg.chat.id,
    `✅ Parsed ${parsed.puzzleDateISO} (${parsed.difficulty ?? "?"})
🟩 ${parsed.tiles.green}  🟡 ${parsed.tiles.clue}  🟨 ${parsed.tiles.retry}
Time: ${parsed.timeSeconds ?? (parsed.timeBandMinutes ? `<${parsed.timeBandMinutes}m` : "unknown")}`
  );
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
