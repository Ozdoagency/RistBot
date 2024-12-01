// Импорты
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import winston from 'winston';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dialogStages from './prompts.js';

// Конфигурация
const config = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || 'Ваш_Telegram_Token',
  WEBHOOK_URL: process.env.WEBHOOK_URL || 'Ваш_Webhook_Url',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'Ваш_Gemini_API_Key',
  GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
  MAX_TELEGRAM_MESSAGE_LENGTH: 4096,
  ADMIN_ID: process.env.ADMIN_ID || null,
  REQUEST_LIMIT: 5,
  REQUEST_WINDOW: 60000,
  PORT: process.env.PORT || 3000,
  GROUP_CHAT_ID: '-4522204925',
  BOT_TOKEN: '2111920825:AAGVeO134IP43jQdU9GNQRJw0gUcJPocqaU',
};

// Инициализация GoogleGenerativeAI
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Инициализация Telegram Bot
const bot = new TelegramBot(config.TELEGRAM_TOKEN, { polling: true });
bot.setWebHook(`${config.WEBHOOK_URL}/bot${config.TELEGRAM_TOKEN}`)
  .then(() => logger.info('Webhook успешно установлен'))
  .catch(error => logger.error(`Ошибка при установке webhook: ${error.message}`));

// Логирование с помощью Winston
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

// Глобальные переменные
const userHistories = {};
const userRequestTimestamps = {};
let userStages = {}; // Хранение текущего этапа для каждого пользователя

// **Функция sendToGemini**
async function sendToGemini(prompt, chatId) {
  try {
    logger.info(`Отправка запроса в Gemini API от chatId ${chatId}: "${prompt}"`);
    const result = await model.generateContent(prompt);

    logger.info(`Полный ответ от Gemini API для chatId ${chatId}: ${JSON.stringify(result)}`);

    if (result.response && result.response.candidates && result.response.candidates.length > 0) {
      const reply = result.response.candidates[0].content.parts[0].text || 'Ответ отсутствует.';
      logger.info(`Ответ от Gemini API для chatId ${chatId}: "${reply}"`);
      return reply;
    } else {
      logger.warn(`Gemini API не вернул кандидатов для chatId ${chatId}.`);
      return 'Извините, я не смог обработать ваш запрос. Gemini API не вернул текст.';
    }
  } catch (error) {
    logger.error(`Ошибка Gemini API для chatId ${chatId}: ${error.message}`);
    throw new Error(`Произошла ошибка при обработке запроса: ${error.message}`);
  }
}

// **Функция задержки**
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// **Функция имитации печати сообщений**
async function sendTypingMessage(chatId, text) {
  if (!text || text.trim() === '') return;

  const typingDelay = 1000; // Задержка перед началом печати
  const typingDuration = Math.min(text.length * 50, 5000); // Длительность печати (максимум 5 секунд)

  await bot.sendChatAction(chatId, 'typing');
  await delay(typingDelay);

  const MAX_LENGTH = config.MAX_TELEGRAM_MESSAGE_LENGTH;
  const messages = [];

  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    messages.push(text.substring(i, i + MAX_LENGTH));
  }

  for (const message of messages) {
    await bot.sendChatAction(chatId, 'typing');
    await delay(typingDuration);
    await bot.sendMessage(chatId, message);
  }
}

// **Функция отправки сообщений**
async function sendMessage(chatId, text) {
  if (!text || text.trim() === '') return;

  const MAX_LENGTH = config.MAX_TELEGRAM_MESSAGE_LENGTH;
  const messages = [];

  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    messages.push(text.substring(i, i + MAX_LENGTH));
  }

  for (const message of messages) {
    await bot.sendMessage(chatId, message);
  }
}

// **Функция отправки данных в группу**
async function sendCollectedDataToGroup(chatId) {
  const userHistory = userHistories[chatId];
  if (!userHistory) return;

  const collectedData = userHistory.map(entry => `${entry.stage}: ${entry.response}`).join('\n');
  const message = `Собранные данные:\n${collectedData}`;

  try {
    const groupBot = new TelegramBot(config.BOT_TOKEN);
    await groupBot.sendMessage(config.GROUP_CHAT_ID, message);
    logger.info(`Данные успешно отправлены в группу для chatId: ${chatId}`);
  } catch (error) {
    logger.error(`Ошибка при отправке данных в группу для chatId ${chatId}: ${error.message}`);
  }
}

// **Функция генерации промпта для Gemini API**
function generatePrompt(userMessage, chatId) {
  const userHistory = userHistories[chatId] || [];
  const context = userHistory.map(entry => `Пользователь: ${entry.response}\нИИ: ${entry.reply}`).join('\н');
  return `${context}\нПользователь: ${userMessage}\нИИ:`;
}

// **Функция обработки длинных ответов**
async function handleLongResponse(chatId, response) {
  const MAX_LENGTH = config.MAX_TELEGRAM_MESSAGE_LENGTH;
  const messages = [];

  for (let i = 0; i < response.length; i += MAX_LENGTH) {
    messages.push(response.substring(i, i + MAX_LENGTH));
  }

  for (const message of messages) {
    await sendTypingMessage(chatId, message);
  }
}

// **Функция генерации следующего вопроса с эмоциональным присоединением**
async function getNextQuestionWithEmotion(stage, userMessage, chatId) {
  const prompt = `Пользователь: ${userMessage}\нИИ:`;
  const aiResponse = await sendToGemini(prompt, chatId);

  const randomText = Array.isArray(stage.text) ? stage.text[Math.floor(Math.random() * stage.text.length)] : stage.text;
  return `${aiResponse} ${randomText}`;
}

// **Обработка команды /start**
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  logger.info(`Получена команда /start от chatId: ${chatId}`);

  // Сбрасываем данные пользователя
  userHistories[chatId] = [];
  userRequestTimestamps[chatId] = { count: 0, timestamp: 0 };
  userStages[chatId] = 0; // Устанавливаем начальный этап

  const firstName = msg.from.first_name || 'пользователь';
  const welcomeMessage = `Здравствуйте, ${firstName}! 👋 Меня зовут Виктория, я представляю онлайн-школу 'Rist'. Мы рады, что вы выбрали нас! Чтобы подобрать время для пробных уроков, мне нужно задать пару вопросов. 
  Расскажите, пожалуйста, какие конкретные пробелы вы хотите устранить и в какой области? Например, устранить пробелы в знаниях, повысить оценки или что то другое. 🎯`;

  logger.info(`Отправка приветственного сообщения для chatId: ${chatId}`);
  await sendTypingMessage(chatId, welcomeMessage);
});

// **Обработка текстовых сообщений**
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;
  logger.info(`Получено сообщение от chatId: ${chatId}, текст: ${userMessage}`);

  // Игнорируем команды
  if (userMessage.startsWith('/')) return;

  try {
    // Проверка текущего этапа диалога
    if (userStages[chatId] === undefined) {
      userStages[chatId] = 0; // Устанавливаем начальный этап
    }

    const currentStage = dialogStages.questions[userStages[chatId]];

    // Сохранение истории диалога
    userHistories[chatId] = userHistories[chatId] || [];
    userHistories[chatId].push({ stage: currentStage.stage, response: userMessage });

    // Переход к следующему этапу
    userStages[chatId]++;
    if (userStages[chatId] < dialogStages.questions.length) {
      const nextStage = dialogStages.questions[userStages[chatId]];
      const nextQuestion = Array.isArray(nextStage.text) ? nextStage.text[Math.floor(Math.random() * nextStage.text.length)] : nextStage.text;
      logger.info(`Отправка следующего вопроса для chatId: ${chatId}`);
      await sendTypingMessage(chatId, nextQuestion);
    } else {
      // Завершение диалога
      delete userStages[chatId];
      logger.info(`Завершение диалога для chatId: ${chatId}`);
      await sendTypingMessage(chatId, "Спасибо! Мы закончили диалог. Если у вас есть вопросы, пишите!");

      // Сообщение о подтверждении времени
      await sendTypingMessage(chatId, "Сейчас уточню доступное время у администратора и подтвержу выбранное время. Это займет пару минут, ожидайте пожалуйста 😊");

      // Отправка собранных данных в группу
      await sendCollectedDataToGroup(chatId);
    }
  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от chatId ${chatId}: ${error.message}`);
    await sendTypingMessage(chatId, `Произошла ошибка: ${error.message}`);
  }
});

// **Express-сервер**
const app = express();
app.use(bodyParser.json());

app.post(`/bot${config.TELEGRAM_TOKEN}`, (req, res) => {
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    logger.error(`Ошибка Webhook: ${error.message}`);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.send('Сервер работает! 🚀');
});

app.listen(config.PORT, () => {
  logger.info(`Сервер запущен на порту ${config.PORT}`);
});
