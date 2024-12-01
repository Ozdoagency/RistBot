import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import winston from 'winston';
import axios from 'axios';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Конфигурация (можно вынести в отдельный файл config.json)
const config = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || 'Ваш_Telegram_Token',
  WEBHOOK_URL: process.env.WEBHOOK_URL || 'Ваш_Webhook_Url',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'Ваш_Gemini_API_Key',
  GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', // URL Gemini API
  MAX_TELEGRAM_MESSAGE_LENGTH: 4096,
  ADMIN_ID: process.env.ADMIN_ID || null,
  REQUEST_LIMIT: 5,
  REQUEST_WINDOW: 60000,
};

// Инициализация GoogleGenerativeAI
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
const bot = new TelegramBot(config.TELEGRAM_TOKEN);
bot.setWebHook(`${config.WEBHOOK_URL}/bot${config.TELEGRAM_TOKEN}`);

// История сообщений для каждого пользователя
const userHistories = {};
const userRequestTimestamps = {};

// Функция для отправки запроса в GEMINI API с обработкой ошибок и ограничением запросов
async function sendToGemini(prompt, chatId) {
  try {
    logger.info(`Отправка запроса к Gemini API от chatId ${chatId}: "${prompt}"`);

    // Генерация контента через Gemini API
    const result = await model.generateContent(prompt);

    // Извлечение текста из первого кандидата
    const candidates = result.response.candidates;
    const reply = candidates && candidates.length > 0 
      ? candidates[0].text 
      : 'Извините, я не смог обработать ваш запрос.';
      
    logger.info(`Ответ от Gemini API для chatId ${chatId}: "${reply}"`);
    return reply;
  } catch (error) {
    logger.error(`Ошибка Gemini API для chatId ${chatId}: ${error.message}`);
    if (config.ADMIN_ID) {
      bot.sendMessage(config.ADMIN_ID, `Ошибка Gemini API: ${error.message} (chatId: ${chatId})`);
    }
    throw new Error(`Произошла ошибка при обработке запроса: ${error.message}`);
  }
}





// Отправка сообщения в Telegram с проверкой длины
async function sendMessage(chatId, text) {
  if (!text || text.trim() === '') return;
  const trimmedText =
    text.length > config.MAX_TELEGRAM_MESSAGE_LENGTH
      ? `${text.substring(0, config.MAX_TELEGRAM_MESSAGE_LENGTH - 3)}...`
      : text;
  return bot.sendMessage(chatId, trimmedText);
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userHistories[chatId] = [];
  userRequestTimestamps[chatId] = { count: 0, timestamp: 0 };
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
  if (userMessage.startsWith('/')) return;

  try {
    const botReply = await sendToGemini(userMessage, chatId);
    await sendMessage(chatId, botReply);
  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от chatId ${chatId}: ${error.message}`);
    await sendMessage(chatId, `Произошла ошибка: ${error.message}`);
  }
});


// Express-сервер
const app = express();
app.use(bodyParser.json());

// Обработка Webhook
app.post(`/bot${config.TELEGRAM_TOKEN}`, (req, res) => {
  logger.info('Получен запрос от Telegram');
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    logger.error(`Ошибка обработки Webhook: ${error.message}`);
    res.sendStatus(500);
    if (config.ADMIN_ID) {
      bot.sendMessage(config.ADMIN_ID, `Ошибка Webhook: ${error.message}`);
    }
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

