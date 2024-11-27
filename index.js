import TelegramBot from 'node-telegram-bot-api';
import express from 'express';

const TELEGRAM_TOKEN = '7733244277:AAFa1YylutZKqaEw0LjBTDRKxZymWz91LPs';
const WEBHOOK_URL = 'https://ristbot.onrender.com';

const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);

const app = express();
app.use(express.json());

const userState = {}; // Состояние пользователей

// Обработка Webhook
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200); // Возвращаем HTTP 200, чтобы Telegram не повторял запрос
});

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat?.id;

  if (!chatId) {
    console.error("Ошибка: отсутствует chatId.");
    return;
  }

  // Проверка состояния пользователя
  if (userState[chatId]?.started) {
    console.log(`Команда /start уже обработана для chatId: ${chatId}`);
    return;
  }

  userState[chatId] = { started: true };

  try {
    console.log(`Обработка команды /start для chatId: ${chatId}`);
    await bot.sendMessage(chatId, "Привет! Бот готов к работе.");
  } catch (error) {
    console.error(`Ошибка при обработке команды /start для chatId ${chatId}: ${error.message}`);
  }
});

// Тестовая обработка сообщений
bot.on("message", async (msg) => {
  const chatId = msg.chat?.id;

  if (!chatId || msg.text?.startsWith("/")) return;

  try {
    console.log(`Получено сообщение от chatId: ${chatId}`);
    await bot.sendMessage(chatId, `Вы сказали: "${msg.text}"`);
  } catch (error) {
    console.error(`Ошибка при обработке сообщения для chatId ${chatId}: ${error.message}`);
  }
});

// Проверка доступности сервера
app.get('/', (req, res) => {
  res.send('Сервер работает! 🚀');
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер работает на порту ${PORT}`);
});
