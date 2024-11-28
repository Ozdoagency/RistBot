import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import winston from 'winston';

const TELEGRAM_TOKEN = '7733244277:AAFa1YylutZKqaEw0LjBTDRKxZymWz91LPs';
const WEBHOOK_URL = 'https://ristbot.onrender.com';
const GRADIO_API_URL = 'https://ozdo-ristbot.hf.space/api/predict';

const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);

// Настройка Winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs.log',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

// Функция для Gradio API
async function sendToGradio(prompt) {
  try {
    logger.info(`Отправка запроса к Gradio API: "${prompt}"`);
    const response = await fetch(GRADIO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: [prompt] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gradio API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const generatedText = result.data[0];

    if (!generatedText) {
      throw new Error('Неверный формат ответа от Gradio API');
    }

    logger.info(`Успешный ответ от Gradio API: "${generatedText}"`);
    return generatedText;
  } catch (error) {
    logger.error(`Ошибка Gradio API: ${error.message}`);
    throw error;
  }
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  logger.info(`Обработка команды /start для chatId: ${chatId}`);
  bot.sendMessage(chatId, 'Добро пожаловать! Напишите мне сообщение, и я отвечу.');
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (userMessage.startsWith('/')) return;

  try {
    logger.info(`Получено сообщение от chatId ${chatId}: "${userMessage}"`);
    const botReply = await sendToGradio(userMessage);
    logger.info(`Отправка ответа для chatId ${chatId}: "${botReply}"`);
    await bot.sendMessage(chatId, botReply);
  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от chatId ${chatId}: ${error.message}`);
    await bot.sendMessage(chatId, 'Извините, произошла ошибка при обработке вашего сообщения.');
  }
});

// Создание Express-сервера
const app = express();
app.use(bodyParser.json());

// Обработка Webhook
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  logger.info('Получен запрос от Telegram');
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    logger.error(`Ошибка обработки Webhook: ${error.message}`);
    res.sendStatus(500);
  }
});

// Проверка доступности сервера
app.get('/', (req, res) => {
  logger.info('Запрос на /');
  res.send('Сервер работает! 🚀');
});

// Запуск сервера
app.listen(process.env.PORT || 3000, () => {
  logger.info(`Сервер запущен на порту ${process.env.PORT || 3000}`);
});
