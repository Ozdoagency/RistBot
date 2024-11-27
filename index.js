import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import winston from 'winston';

const TELEGRAM_TOKEN = '7733244277:AAFa1YylutZKqaEw0LjBTDRKxZymWz91LPs';
const WEBHOOK_URL = 'https://ristbot.onrender.com';
const HF_API_URL = 'https://api-inference.huggingface.co/models/facebook/opt-30b';
const HF_API_TOKEN = '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';

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
      maxsize: 5 * 1024 * 1024, // Максимальный размер файла - 5 MB
      maxFiles: 5, // Хранить до 5 архивных файлов
    }),
  ],
});

// Функция для Hugging Face API
async function sendToHuggingFace(prompt) {
  try {
    logger.info(`Отправка запроса к Hugging Face API: "${prompt}"`);
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 200, // Длинные ответы
          temperature: 0.8,
          top_p: 0.9,
          repetition_penalty: 1.1,
          do_sample: true, // Включение режима выборки
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hugging Face API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const generatedText = result[0]?.generated_text;

    if (!generatedText) {
      throw new Error('Неверный формат ответа от Hugging Face API');
    }

    logger.info(`Успешный ответ от Hugging Face API: "${generatedText}"`);
    return generatedText;
  } catch (error) {
    logger.error(`Ошибка Hugging Face API: ${error.message}`);
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
    const botReply = await sendToHuggingFace(userMessage);
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
