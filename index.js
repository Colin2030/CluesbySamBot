import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.8540305777:AAEesA51C2ItFEIu4fNM7Rmv48Gub6PRNUY);

app.post(`/webhook/${process.env.8540305777:AAEesA51C2ItFEIu4fNM7Rmv48Gub6PRNUY}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

bot.on('message', msg => {
  if (msg.chat.id.toString() !== process.env.GROUP_CHAT_ID) return;

  bot.sendMessage(msg.chat.id, '👋 Clues bot is awake');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
