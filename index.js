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

// Подключение к Gradio API
async function sendToGradio(message) {
  try {
    logger.info(`Отправка запроса к Gradio API: "${message}"`);

    // Подключение к Space
    const client = await Client.connect(GRADIO_SPACE);

    // Выполнение запроса
    const result = await client.predict('/chat', {
      message: message,
      system_message: 'You are a friendly Chatbot.',
      max_tokens: 150,
      temperature: 0.7,
      top_p: 0.9,
    });

    logger.info(`Успешный ответ от Gradio API: "${result.data}"`);
    return result.data; // Возвращает сгенерированный текст
  } catch (error) {
    logger.error(`Ошибка Gradio API: ${error.message}`);
    throw error;
  }
}

// Форматирование ответа от Gradio API
async function formatGradioResponse(response) {
  // Убедимся, что response — это строка
  const textResponse = typeof response === 'string' ? response : String(response);

  // Удаляем текст в скобках
  const cleanedResponse = textResponse.replace(/\(.*?\)/g, '').trim();

  // Если текст пустой после обработки
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
  logger.info(`Обработка команды /start для chatId: ${chatId}`);
  bot.sendMessage(chatId, 'Добро пожаловать! Напишите мне сообщение, и я отвечу.');
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (userMessage.startsWith('/')) return; // Игнорируем команды

  try {
    logger.info(`Получено сообщение от chatId ${chatId}: "${userMessage}"`);
    let botReply = await sendToGradio(userMessage);

    // Форматируем ответ от Gradio API
    botReply = await formatGradioResponse(botReply);

    // Отправляем сообщение
    await sendMessage(chatId, botReply);
    logger.info(`Отправка ответа для chatId ${chatId}: "${botReply}"`);
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
