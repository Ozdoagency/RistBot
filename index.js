import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import winston from 'winston';
import { Client } from '@gradio/client';

// Конфигурация
const TELEGRAM_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN'; // Замените на ваш токен
const WEBHOOK_URL = 'https://ristbot.onrender.com';  // URL для webhook
const GRADIO_SPACE = 'Ozdo/ristbot'; // Пример пространства Gradio
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

// Настройка Winston для логирования
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs.log', maxsize: 5 * 1024 * 1024, maxFiles: 5 }),
  ],
});

// Инициализация Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);

// История сообщений для каждого пользователя
const userHistories = {};

// Функция для отправки запроса в Gradio API
async function sendToGradio(message) {
  try {
    logger.info(`Отправка запроса к Gradio API: "${message}"`);
    const client = await Client.connect(GRADIO_SPACE);

    // Простой запрос без использования истории
    const result = await client.predict('/chat', {
      message,
      max_tokens: 200,
      temperature: 0.7,
      top_p: 0.9,
    });

    const response = result.data || '';
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
  return cleanedResponse || 'Извините, я не смог понять ваш запрос.';
}

// Отправка сообщения в Telegram с проверкой длины
async function sendMessage(chatId, text) {
  if (!text || text.trim() === '') {
    throw new Error('Message text is empty');
  }

  const trimmedText =
    text.length > MAX_TELEGRAM_MESSAGE_LENGTH
      ? `${text.substring(0, MAX_TELEGRAM_MESSAGE_LENGTH - 3)}...`
      : text;

  return bot.sendMessage(chatId, trimmedText);
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // Инициализируем историю пользователя
  userHistories[chatId] = [];

  // Персонализированное приветствие
  const firstName = msg.from.first_name || 'пользователь';
  const welcomeMessage = `Здравствуйте, ${firstName}! 👋 Меня зовут Виктория, я представляю онлайн-школу "Rist". Мы рады, что вы выбрали нас! ` +
    'Чтобы записать вашего ребёнка на пробные уроки, мне нужно задать пару вопросов. ' +
    'Какую цель вы хотите достичь с помощью наших занятий? 🎯';

  logger.info(`Обработка команды /start для chatId: ${chatId}`);
  bot.sendMessage(chatId, welcomeMessage);
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  // Игнорируем команды (например, /start, /help)
  if (userMessage.startsWith('/')) return;

  // Получение имени пользователя
  const firstName = msg.from.first_name || 'пользователь';

  try {
    // Инициализируем историю, если её нет
    if (!userHistories[chatId]) {
      userHistories[chatId] = [];
    }

    logger.info(`Получено сообщение от chatId ${chatId}: "${userMessage}"`);

    // Запрос к Gradio API
    const botReply = await sendToGradio(userMessage);
    const formattedReply = formatGradioResponse(botReply);

    // Персонализированный ответ
    const personalizedReply = `${formattedReply}`;
    await sendMessage(chatId, personalizedReply);

    logger.info(`Отправка ответа для chatId ${chatId}: "${personalizedReply}"`);
  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от chatId ${chatId}: ${error.message}`);
    await sendMessage(chatId, `Извините, ${firstName}, произошла ошибка при обработке вашего сообщения.`);
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
