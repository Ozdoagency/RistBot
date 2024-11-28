import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import winston from 'winston';
import { Client } from '@gradio/client';

// Конфигурация (можно вынести в отдельный файл config.json)
const config = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || '7733244277:AAFa1YylutZKqaEw0LjBTDRKxZymWz91LPs',
  WEBHOOK_URL: process.env.WEBHOOK_URL || 'https://ristbot.onrender.com',
  GRADIO_SPACE: process.env.GRADIO_SPACE || 'Ozdo/Qwen-Qwen2.5-Coder-32B-Instruct',
  MAX_TELEGRAM_MESSAGE_LENGTH: 4096,
  ADMIN_ID: process.env.ADMIN_ID || null,
  REQUEST_LIMIT: 5,
  REQUEST_WINDOW: 60000,
};

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

// Функция для отправки запроса в Gradio API с обработкой ошибок и ограничением запросов
async function sendToGradio(message, chatId) {
  const now = Date.now();
  const timestampData = userRequestTimestamps[chatId] || { count: 0, timestamp: 0 };
  const requestCount = timestampData.count;

  if (now - timestampData.timestamp < config.REQUEST_WINDOW && requestCount >= config.REQUEST_LIMIT) {
    const remainingTime = Math.ceil((config.REQUEST_WINDOW - (now - timestampData.timestamp)) / 1000);
    throw new Error(`Превышено количество запросов. Пожалуйста, подождите ${remainingTime} секунд.`);
  }

  try {
    logger.info(`Отправка запроса к Gradio API от chatId ${chatId}: "${message}"`);
    const client = await Client.connect(config.GRADIO_SPACE);

    try {
      const testResponse = await client.predict('/test');
      if (!testResponse.success) {
        throw new Error('Gradio API недоступен.');
      }
    } catch (testError) {
      throw new Error(`Ошибка проверки доступности Gradio: ${testError.message}`);
    }

    const result = await client.predict('/chat', { message, max_tokens: 200, temperature: 0.7, top_p: 0.9 });
    const response = result.data || '';
    logger.info(`Успешный ответ от Gradio API для chatId ${chatId}: "${response}"`);
    userRequestTimestamps[chatId] = { count: requestCount + 1, timestamp: now };
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Ошибка Gradio API для chatId ${chatId}: ${errorMessage}`);
    if (config.ADMIN_ID) {
      bot.sendMessage(config.ADMIN_ID, `Ошибка Gradio API: ${errorMessage} (chatId: ${chatId})`);
    }
    throw new Error(`Произошла ошибка при обработке запроса: ${errorMessage}`);
  }
}

// Форматирование ответа от Gradio API с обработкой нестроковых ответов
function formatGradioResponse(response) {
  if (typeof response === 'string') {
    const cleanedResponse = response.replace(/<\|.*?\|>/g, '').trim();
    return cleanedResponse || 'Извините, я не смог понять ваш запрос.';
  } else if (typeof response === 'object' && response !== null) {
    try {
      const jsonString = JSON.stringify(response, null, 2);
      const trimmedJson = jsonString.length > config.MAX_TELEGRAM_MESSAGE_LENGTH ?
                         `${jsonString.substring(0, config.MAX_TELEGRAM_MESSAGE_LENGTH - 3)}...` :
                         jsonString;
      return trimmedJson;
    } catch (jsonError) {
      logger.error(`Ошибка преобразования ответа Gradio в JSON: ${jsonError.message}`);
      return 'Извините, я не смог обработать ответ от сервера.';
    }
  } else {
    return 'Извините, я не смог понять ваш запрос.';
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
  const firstName = msg.from.first_name || 'пользователь';

  try {
    userHistories[chatId] = userHistories[chatId] || [];
    logger.info(`Получено сообщение от chatId ${chatId}: "${userMessage}"`);
    userHistories[chatId].push({ user: userMessage });

    const botReply = await sendToGradio(userMessage, chatId);
    const formattedReply = formatGradioResponse(botReply);
    await sendMessage(chatId, formattedReply);
    logger.info(`Отправка ответа для chatId ${chatId}: "${formattedReply}"`);
  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от chatId ${chatId}: ${error.message}`);
    await sendMessage(chatId, `Извините, ${firstName}, произошла ошибка: ${error.message}`);
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

