import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import winston from 'winston';
import fetch from 'node-fetch';
import { connectToMongoDB, getDb } from './mongodb.js'; // Подключение MongoDB
import dialogStages from './prompts/dialogStages.js'; // Сценарии диалога

// Настройка логирования
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
    new winston.transports.File({ filename: 'bot.log' }),
  ],
});

// Переменные окружения
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "7733244277:AAFa1YylutZKqaEw0LjBTDRKxZymWz91LPs";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://ristbot.onrender.com";
const HF_ACCESS_TOKEN = process.env.HF_ACCESS_TOKEN || "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";
const HF_MODEL = "DeepPavlov/rubert-base-cased-conversational"; // Укажите нужную модель
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

// Инициализация бота
const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);

// Хранилище состояния пользователей
const userState = {};

// Функция для генерации ответов через Hugging Face API
async function sendToHuggingFace(prompt) {
  try {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_length: 150, temperature: 0.7 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hugging Face API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.generated_text || 'Ошибка при генерации текста. Попробуйте позже.';
  } catch (error) {
    logger.error(`Ошибка взаимодействия с Hugging Face API: ${error.message}`);
    return 'Извините, произошла ошибка при обработке вашего запроса.';
  }
}

// Отправка сообщения с проверкой на дублирование
const sendMessageWithCheck = async (chatId, message) => {
  try {
    await bot.sendMessage(chatId, message);
    logger.info(`Message sent to chatId ${chatId}: ${message}`);
  } catch (error) {
    logger.error(`Ошибка отправки сообщения для chatId ${chatId}: ${error.message}`);
  }
};

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat?.id;
  const welcomeMessage = "Здравствуйте! 👋 Меня зовут Виктория, я представляю онлайн-школу 'Rist'. Как я могу помочь вам сегодня?";

  if (!chatId) {
    logger.error('chatId отсутствует в сообщении:', JSON.stringify(msg, null, 2));
    return;
  }

  try {
    logger.info(`Начало обработки команды /start для chatId ${chatId}`);
    if (!userState[chatId]) {
      await sendMessageWithCheck(chatId, welcomeMessage);
      userState[chatId] = { stage: 0, data: {}, askedPhone: false };
      await askNextQuestion(chatId);
    } else {
      logger.info(`Пользователь chatId ${chatId} уже активен.`);
    }
  } catch (error) {
    logger.error(`Ошибка при обработке команды /start для chatId ${chatId}: ${error.message}`);
  }
});

// Обработка обычных сообщений
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat?.id;
  const welcomeMessage = "Здравствуйте! 👋 Меня зовут Виктория, я представляю онлайн-школу 'Rist'. Как я могу помочь вам сегодня?";

  if (!chatId) {
    logger.error('chatId отсутствует в сообщении:', JSON.stringify(msg, null, 2));
    return;
  }

  try {
    logger.info(`Начало обработки команды /start для chatId ${chatId}`);

    if (!userState[chatId]) {
      await sendMessageWithCheck(chatId, welcomeMessage);
      userState[chatId] = { stage: 0, data: {}, askedPhone: false };

      // Обработка первого вопроса
      try {
        await askNextQuestion(chatId);
      } catch (error) {
        logger.error(`Ошибка в askNextQuestion для chatId ${chatId}: ${error.message}`);
      }
    } else {
      logger.info(`Пользователь chatId ${chatId} уже активен.`);
    }
  } catch (error) {
    logger.error(`Ошибка при обработке команды /start для chatId ${chatId}: ${error.message}`);
  }
});

// Функция для задавания вопросов пользователю
const askNextQuestion = async (chatId) => {
  const user = userState[chatId] || { stage: 0, data: {}, askedPhone: false };
  userState[chatId] = user;

  try {
    const question = dialogStages?.questions[user.stage];
    if (question) {
      await sendMessageWithCheck(chatId, question.text);
      user.stage += 1;
    } else {
      logger.info(`Все вопросы заданы для chatId ${chatId}.`);
      await sendMessageWithCheck(chatId, 'Спасибо! Мы собрали все данные.');
      delete userState[chatId];
    }
  } catch (error) {
    logger.error(`Ошибка в askNextQuestion для chatId ${chatId}: ${error.message}`);
  }
};

// Создание Express-сервера
const app = express();
app.use(bodyParser.json());

// Обработка Webhook от Telegram
app.post('/webhook', (req, res) => {
  logger.info(`Получено обновление от Telegram: ${JSON.stringify(req.body)}`);
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Проверка доступности сервера
app.get('/', (req, res) => {
  res.send('Сервер работает! 🚀');
});

// Подключение к MongoDB перед запуском сервера
(async () => {
  try {
    await connectToMongoDB();
    logger.info('MongoDB подключена и готова к использованию.');
    app.listen(process.env.PORT || 3000, () => {
      logger.info(`Сервер запущен на порту ${process.env.PORT || 3000}`);
    });
  } catch (error) {
    logger.error(`Ошибка подключения к MongoDB: ${error.message}`);
    process.exit(1);
  }
})();
