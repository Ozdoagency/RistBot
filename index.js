// Импорты
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import winston from 'winston';
import { GoogleGenerativeAI } from "@google/generative-ai";
import nodemailer from 'nodemailer';

import basePrompt from './prompts/basePrompt.js';
import dialogStages from './prompts/dialogStages.js';
import generalQuestions from './prompts/generalQuestions.js';
import objectionHandling from './prompts/objectionHandling.js';
import pricing from './prompts/pricing.js';

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
};

// Инициализация GoogleGenerativeAI
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Инициализация Telegram Bot
const bot = new TelegramBot(config.TELEGRAM_TOKEN);
bot.setWebHook(`${config.WEBHOOK_URL}/bot${config.TELEGRAM_TOKEN}`);

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

// Конфигурация почтового сервера
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Функция отправки email
async function sendEmail(to, subject, text) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Email отправлен на ${to}`);
  } catch (error) {
    logger.error(`Ошибка при отправке email: ${error.message}`);
  }
}

// Глобальные переменные
const userHistories = {};
const userRequestTimestamps = {};
let userStages = {}; // Хранение текущего этапа для каждого пользователя

// **Функция sendToGemini**
async function sendToGemini(prompt, chatId) {
  try {
    logger.info(`Отправка запроса к Gemini API от chatId ${chatId}: "${prompt}"`);
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

// **Обработка команды /start**
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  // Сбрасываем данные пользователя
  userHistories[chatId] = [];
  userRequestTimestamps[chatId] = { count: 0, timestamp: 0 };
  userStages[chatId] = 1; // Устанавливаем этап на "Класс" (пропускаем "Приветствие")

  const firstName = msg.from.first_name || 'пользователь';
  const welcomeMessage = `Добрый день! 👋 Меня зовут Виктория, я представляю онлайн-школу 'Rist'. Мы рады, что вы выбрали нас! Чтобы подобрать время для пробных уроков, мне нужно задать пару вопросов.\n\nРасскажите, пожалуйста, какую цель вы хотите д��стичь с помощью занятий? Например, устранить пробелы, повысить оценки или подготовиться к экзаменам. 🎯`;

  logger.info(`Обработка команды /start для chatId: ${chatId}`);
  await sendMessage(chatId, welcomeMessage);

  // Генерация ответа через Gemini для приветственного сообщения
  const combinedPrompt = `${basePrompt}\n${welcomeMessage}`;
  const botReply = await sendToGemini(combinedPrompt, chatId);
  await sendMessage(chatId, botReply);

  // Начинаем со следующего этапа после приветствия
  const firstStage = dialogStages.questions[userStages[chatId]];
  await sendMessage(chatId, firstStage.text);
});

// **Обработка текстовых сообщений**
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  // Игнорируем команды (кроме /start, которая уже обрабатывается отдельно)
  if (userMessage.startsWith('/')) return;

  try {
    // Если этап диалога не установлен (новый пользователь), инициализируем
    if (userStages[chatId] === undefined) {
      userStages[chatId] = 0; // Устанавливаем начальный этап
    }

    const currentStage = dialogStages.questions[userStages[chatId]];

    // Проверка валидации (если требуется)
    if (currentStage.validation && !currentStage.validation(userMessage)) {
      await sendMessage(chatId, currentStage.errorText || 'Ответ не подходит. Попробуйте снова.');
      return;
    }

    // Сохраняем ответ пользователя
    userHistories[chatId] = userHistories[chatId] || [];
    userHistories[chatId].push({ stage: currentStage.stage, response: userMessage });

    // Если текущий этап - Email, отправляем email
    if (currentStage.stage === "Email") {
      await sendEmail(userMessage, 'Спасибо за регистрацию!', 'Мы свяжемся с вами в ближайшее время.');
    }

    // Генерация ответа через Gemini
    const combinedPrompt = `${basePrompt}\n${currentStage.text}\nПользователь: ${userMessage}`;
    const botReply = await sendToGemini(combinedPrompt, chatId);
    await sendMessage(chatId, botReply);

    // Переход к следующему этапу
    userStages[chatId]++;
    if (userStages[chatId] < dialogStages.questions.length) {
      const nextStage = dialogStages.questions[userStages[chatId]];
      await sendMessage(chatId, nextStage.text);
    } else {
      // Завершение диалога
      delete userStages[chatId];
      await sendMessage(chatId, "Спасибо! Мы закончили диалог. Если у вас есть вопросы, пишите!");
    }
  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от chatId ${chatId}: ${error.message}`);
    await sendMessage(chatId, `Произошла ошибка: ${error.message}`);
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
