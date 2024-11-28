import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import winston from 'winston';
import { Client } from '@gradio/client';

// Конфигурация
const TELEGRAM_TOKEN = '7733244277:AAFa1YylutZKqaEw0LjBTDRKxZymWz91LPs';
const WEBHOOK_URL = 'https://ristbot.onrender.com';
const GRADIO_SPACE = 'Ozdo/ristbot';
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

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
    new winston.transports.File({ filename: 'logs.log', maxsize: 5 * 1024 * 1024, maxFiles: 5 }),
  ],
});

// Telegram Bot Initialization
const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);

// История сообщений
const userHistories = {}; // Словарь для хранения истории по chatId

// Функция для отправки запроса в Gradio API
async function sendToGradio(message, history) {
  try {
    logger.info(`Отправка запроса к Gradio API: "${message}" с историей: ${JSON.stringify(history)}`);
    const client = await Client.connect(GRADIO_SPACE);

    // Добавляем текущее сообщение пользователя в историю
    history.push({ role: 'user', content: message });

    const result = await client.predict('/chat', {
      message,
      max_tokens: 200,
      temperature: 0.7,
      top_p: 0.9,
      history, // Передаем историю
    });

    const response = result.data || '';
    history.push({ role: 'assistant', content: response }); // Сохраняем ответ ассистента в историю

    logger.info(`Успешный ответ от Gradio API: "${response}"`);
    return response;
  } catch (error) {
    logger.error(`Ошибка Gradio API: ${error.message}`);
    throw error;
  }
}

// Форматирование ответа от Gradio API
function formatGradioResponse(response) {
  const textResponse = typeof response === 'string' ? response : String(response);
  const cleanedResponse = textResponse.replace(/<\|.*?\|>/g, '').trim();

  if (!cleanedResponse) {
    return 'Извините, я не смог понять ваш запрос.';
  }

  return cleanedResponse;
}

// Отправка сообщения в Telegram с проверкой длины
async function sendMessage(chatId, text) {
  if (!text || text.trim() === '') {
    throw new Error('Message text is empty');
  }

  const trimmedText =
    text.length > MAX_TELEGRAM_MESSAGE_LENGTH
      ? text.substring(0, MAX_TELEGRAM_MESSAGE_LENGTH - 3) + '...'
      : text;

  return bot.sendMessage(chatId, trimmedText);
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userHistories[chatId] = []; // Инициализируем историю для нового пользователя
  logger.info(`Обработка команды /start для chatId: ${chatId}`);
  bot.sendMessage(chatId, 'Добро пожаловать! Напишите мне сообщение, и я отвечу.');
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (userMessage.startsWith('/')) return;

  try {
    if (!userHistories[chatId]) {
      userHistories[chatId] = []; // Инициализируем историю, если её ещё нет
    }

    logger.info(`Получено сообщение от chatId ${chatId}: "${userMessage}"`);
    const botReply = await sendToGradio(userMessage, userHistories[chatId]);
    const formattedReply = formatGradioResponse(botReply);
    await sendMessage(chatId, formattedReply);
    logger.info(`Отправка ответа для chatId ${chatId}: "${formattedReply}"`);
  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от chatId ${chatId}: ${error.message}`);
    await sendMessage(chatId, 'Извините, произошла ошибка при обработке вашего сообщения.');
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
