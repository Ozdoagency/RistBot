import TelegramBot from 'node-telegram-bot-api';
import { connectToMongoDB, getDb } from './mongodb.js';
import { sendFollowUps } from './followUps.js';
import express from 'express';
import bodyParser from 'body-parser';
import winston from 'winston';
import fetch from 'node-fetch';

// Подключение модулей промптов
import basePrompt from './prompts/basePrompt.js';
import dialogStages from './prompts/dialogStages.js';
import pricing from './prompts/pricing.js';
import objectionHandling from './prompts/objectionHandling.js';
import generalQuestions from './prompts/generalQuestions.js';

// Пример объединения промптов для генерации ответа
const SYSTEM_PROMPT = `${basePrompt}\n\n${dialogStages}\n\n${pricing}\n\n${objectionHandling}\n\n${generalQuestions}`;

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

// Инициализация Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);

const lastMessages = {};
const userContext = {};
const userState = {};

// Формируем промпт динамически
function getPrompt(stage, objection) {
  let prompt = basePrompt;

  if (stage !== undefined) {
    prompt += `\n\nЭтап диалога: ${dialogStages.questions[stage]}`;
  }

  if (objection !== undefined) {
    prompt += `\n\nОтвет на возражение: ${objections[objection]}`;
  }

  return prompt;
}

async function sendToHuggingFace(prompt) {
  try {
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 150, // Максимальная длина ответа
          temperature: 0.7, // Контроль случайности
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка Hugging Face API: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.generated_text || "Ошибка при генерации текста. Попробуйте позже.";
  } catch (error) {
    logger.error(`Ошибка взаимодействия с Hugging Face API: ${error.message}`);
    return "Извините, произошла ошибка при обработке вашего запроса.";
  }
}

async function generateResponse(stage, objection) {
  const prompt = getPrompt(stage, objection); // Формируем промпт на основе этапа и возражений
  const response = await sendToHuggingFace(prompt); // Отправляем в Hugging Face API
  return response; // Возвращаем ответ
}

const sendMessageWithCheck = async (chatId, message) => {
  if (lastMessages[chatId] === message) {
    logger.info(`Duplicate message detected for chatId ${chatId}, skipping send.`);
    return;
  }

  await bot.sendMessage(chatId, message); // Исправлено: вызов напрямую bot.sendMessage
  lastMessages[chatId] = message;
  logger.info(`Message sent to chatId ${chatId}: ${message}`);
};

// Создание Express-сервера
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Обработка POST-запросов от Telegram
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  logger.info(`Получено обновление от Telegram: ${JSON.stringify(req.body)}`);
  bot.processUpdate(req.body); // Передаём обновления от Telegram боту
  res.sendStatus(200); // Подтверждаем получение
});

// Добавление проверки доступности сервера через GET
app.get('/', (req, res) => {
  res.send('Сервер работает! 🚀');
});

app.get('/webhook', (req, res) => {
  res.send('Webhook ожидает POST-запросы от Telegram.');
});

// Подключение к MongoDB перед запуском сервера
(async () => {
  try {
    await connectToMongoDB();
    logger.info("MongoDB подключена и готова к использованию.");

    // Логика Express сервера
    app.listen(PORT, () => {
      logger.info(`Сервер запущен на порту ${PORT}`);
    });

  } catch (error) {
    logger.error(`Ошибка в основной функции: ${error.message}`);
    process.exit(1);
  }
})();

const sendSummaryToSecondBot = async (summary) => {
  const SECOND_BOT_TOKEN = "2111920825:AAEi07nuwAG92q4gqrEcnzZJ_WT8dp9-ieA";
  const SECOND_BOT_CHAT_ID = "4522204925"; // Укажите ID группового чата

  const apiUrl = `https://api.telegram.org/bot${SECOND_BOT_TOKEN}/sendMessage`;

  try {
    const message = `
📝 *Новая заявка:*
1️⃣ *Цели обучения:* ${summary.goal || "Не указано"}
2️⃣ *Класс ученика:* ${summary.grade || "Не указано"}
3️⃣ *Уровень знаний:* ${summary.knowledge || "Не указано"}
4️⃣ *Дата и время:* ${summary.date || "Не указано"}
5️⃣ *Номер телефона:* ${summary.phone || "Не указано"}
    `;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: SECOND_BOT_CHAT_ID, // Используем ID группы
        text: message,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка при отправке данных: ${response.status} - ${errorText}`);
    }

    console.log("Данные успешно отправлены в группу!");
  } catch (error) {
    console.error(`Ошибка при отправке данных во второй бот: ${error.message}`);
  }
};

/// Функция для обработки вопросов и этапов диалога
const askNextQuestion = async (chatId, bot) => {
  const user = userState[chatId] || { stage: 0, data: {}, askedPhone: false };
  userState[chatId] = user;

  const optionalQuestions = dialogStages.questions.filter(
    (q) => q.stage !== "Сбор информации - Подтверждение времени"
  );

  try {
    if (!user.askedPhone && user.stage >= optionalQuestions.length) {
      // Обязательно спрашиваем номер телефона
      const phoneQuestion = dialogStages.questions.find(
        (q) => q.stage === "Сбор информации - Подтверждение времени"
      );
      await sendMessageWithCheck(chatId, phoneQuestion.text);
      user.askedPhone = true; // Помечаем, что вопрос задан
      logger.info(`Вопрос про номер телефона задан для chatId ${chatId}`);
    } else if (user.stage < optionalQuestions.length) {
      // Задаём остальные вопросы
      const question = optionalQuestions[user.stage];
      await sendMessageWithCheck(chatId, question.text);
      user.stage += 1; // Обновляем этап
      logger.info(`Этап обновлён для chatId ${chatId}: ${user.stage}`);
    } else {
      // Все вопросы заданы
      const summary = {
        goal: user.data.goal || "Не указано",
        grade: user.data.grade || "Не указано",
        knowledge: user.data.knowledge || "Не указано",
        date: user.data.date || "Не указано",
        phone: user.data.phone || "Не указано",
      };

      logger.info(`Все вопросы заданы для chatId ${chatId}. Отправляем данные.`);
      await sendSummaryToSecondBot(summary);

      await sendMessageWithCheck(
        chatId,
        "Спасибо! Мы собрали все данные. Наш менеджер свяжется с вами."
      );
      delete userState[chatId]; // Удаление состояния
    }
  } catch (error) {
    logger.error(`Ошибка в askNextQuestion для chatId ${chatId}: ${error.message}`);
  }
};

const saveUserMessage = async (chatId, message) => {
  try {
    const db = getDb();
    const collection = db.collection('userMessages');

    if (!chatId || !message) {
      throw new Error('Отсутствует chatId или сообщение для сохранения.');
    }

    const existingMessage = await collection.findOne({
      userId: chatId,
      "messages.content": message,
    });

    if (existingMessage) {
      logger.info(`Сообщение уже существует для chatId ${chatId}: ${message}`);
      return; // Если сообщение уже существует, пропускаем сохранение
    }

    await collection.updateOne(
      { userId: chatId },
      { $push: { messages: { content: message, timestamp: new Date() } } },
      { upsert: true }
    );
    logger.info(`Сообщение "${message}" сохранено для пользователя ${chatId}`);
  } catch (error) {
    logger.error(`Ошибка сохранения сообщения в MongoDB для chatId ${chatId}: ${error.message}`);
  }
};

app.use(bodyParser.json());

// Обработка POST-запросов от Telegram
app.post('/webhook', (req, res) => {
  logger.info(`Получено обновление от Telegram: ${JSON.stringify(req.body)}`);
  bot.processUpdate(req.body); // Передаём обновления от Telegram боту
  res.sendStatus(200); // Подтверждаем получение
});

// Добавление проверки доступности сервера через GET
app.get('/', (req, res) => {
  res.send('Сервер работает! 🚀');
});

app.get('/webhook', (req, res) => {
  res.send('Webhook ожидает POST-запросы от Telegram.');
});

// Подключение к MongoDB перед запуском сервера
(async () => {
  try {
    // Ваш код, например, подключение к MongoDB
    await connectToMongoDB();
    logger.info("MongoDB подключена и готова к использованию.");

    // Дополнительная логика, если есть
  } catch (error) {
    logger.error(`Ошибка в основной функции: ${error.message}`);
    process.exit(1);
  }
})();

// Запуск функции фоллоу-апов при необходимости
const handleFollowUps = async (chatId) => {
  try {
    const db = getDb();
    const collection = db.collection('userMessages');

    // Проверка на наличие номера телефона
    const userMessages = await collection.findOne({ userId: chatId });
    const hasPhoneNumber = userMessages?.messages.some((message) =>
      /\+?\d{10,15}/.test(message.content)
    );

    if (!hasPhoneNumber) {
      await sendFollowUps(bot, chatId); // Отправляем фоллоу-апы
      logger.info(`Фоллоу-апы запущены для пользователя ${chatId}`);
    }
  } catch (error) {
    logger.error(`Ошибка при запуске фоллоу-апов для chatId ${chatId}: ${error.message}`);
  }
};

// Генерация случайной задержки для эффекта "печатания" (от 3 до 6 секунд)
function getThinkingDelay() {
  return Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000; // Увеличена задержка перед "печатанием"
}

// Генерация времени "печатания" на основе длины текста (до 20 секунд максимум)
function calculateTypingTime(text) {
  const words = text.split(' ').length;
  const baseTime = 3; // Базовое время в секундах
  return Math.min(baseTime + words * 0.7, 20) * 1000; // Скорость: 0.7 сек/слово, максимум 20 сек
}

// Функция для очистки старых сообщений
const cleanupOldMessages = async (chatId) => {
  try {
    const db = getDb();
    const collection = db.collection('userMessages');
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 дней назад

    if (!chatId) {
      throw new Error('chatId отсутствует для очистки сообщений.');
    }

    await collection.updateOne(
      { userId: chatId },
      { $pull: { messages: { timestamp: { $lt: cutoffDate } } } }
    );
    logger.info(`Старые сообщения удалены для пользователя ${chatId}`);
  } catch (error) {
    logger.error(`Ошибка при очистке старых сообщений для chatId ${chatId}: ${error.message}`);
  }
};

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat?.id;

  if (!chatId) {
    logger.error('chatId отсутствует в сообщении:', JSON.stringify(msg, null, 2));
    return;
  }

  const welcomeMessage =
    "Здравствуйте! 👋 Меня зовут Виктория, я представляю онлайн-школу 'Rist'. Мы рады, что вы выбрали нас! Чтобы подобрать время для пробных уроков, мне нужно задать пару вопросов. Расскажите, пожалуйста, какую цель вы хотите достичь с помощью занятий? Например, устранить пробелы, повысить оценки или подготовиться к экзаменам.";

  try {
    // Устанавливаем задержку на 4 секунды
    setTimeout(async () => {
      await bot.sendMessage(chatId, welcomeMessage);

      // Инициализируем состояние пользователя
      userState[chatId] = { stage: 0, data: {} };

      // Переходим к первому вопросу
      await askNextQuestion(chatId, bot);

      logger.info(`Диалог начат для пользователя ${chatId}`);
    }, 4000); // Задержка 4 секунды
  } catch (error) {
    logger.error(`Ошибка при обработке команды /start для chatId ${chatId}: ${error.message}`);
  }
});


// Обработчик сообщений
bot.on("message", async (msg) => {
  const chatId = msg.chat?.id;

  if (!chatId) {
    logger.error("chatId отсутствует в сообщении:", JSON.stringify(msg, null, 2));
    return;
  }

  if (msg.text?.startsWith("/")) {
    return; // Игнорируем команды
  }

  try {
    // Убедитесь, что состояние пользователя есть
    const user = userState[chatId] || { stage: 0, data: {}, askedPhone: false };
    userState[chatId] = user;

    // Сохраняем сообщение
    const userMessage = msg.text;
    await saveUserMessage(chatId, userMessage);

    // Определяем, что делать на каждом этапе
    switch (user.stage) {
      case 0:
        user.data.goal = userMessage;
        break;
      case 1:
        user.data.grade = userMessage;
        break;
      case 2:
        user.data.knowledge = userMessage;
        break;
      case 3:
        user.data.date = userMessage;
        break;
      case 4:
        if (!user.askedPhone) {
          user.data.phone = userMessage;
          user.askedPhone = true; // Помечаем, что номер телефона задан
        }
        break;
      default:
        logger.error(`Неизвестный этап для chatId ${chatId}: ${user.stage}`);
        return;
    }

    // Очистка старых сообщений
    await cleanupOldMessages(chatId);
    logger.info(`Старые сообщения для пользователя ${chatId} очищены.`);

    // Проверка, завершены ли все вопросы
    if (user.stage >= 4 && user.askedPhone) {
      const summary = {
        goal: user.data.goal || "Не указано",
        grade: user.data.grade || "Не указано",
        knowledge: user.data.knowledge || "Не указано",
        date: user.data.date || "Не указано",
        phone: user.data.phone || "Не указано",
      };

      logger.info(`Все вопросы завершены для chatId ${chatId}.`);
      await sendSummaryToSecondBot(summary);

      await bot.sendMessage(chatId, "Спасибо! Мы собрали все данные. Наш менеджер свяжется с вами.");
      delete userState[chatId]; // Удаляем состояние пользователя
      return;
    }

    // Эффект "печатания" с задержкой перед генерацией ответа
    bot.sendChatAction(chatId, "typing");
    await new Promise((resolve) => setTimeout(resolve, getThinkingDelay())); // Задержка в правильном месте

    // Генерация ответа с использованием Hugging Face API
    const stage = user.stage;
    const response = await generateResponse(stage, user.objection);

    // Сохранение ответа в MongoDB
    try {
      const db = getDb();
      const collection = db.collection("userContext");
      userContext[chatId] = userContext[chatId] || [];
      userContext[chatId].push({ role: "assistant", content: response });
      await collection.updateOne(
        { userId: chatId },
        { $set: { context: userContext[chatId] } },
        { upsert: true }
      );
      logger.info(`Ответ для пользователя ${chatId} сохранён в MongoDB.`);
    } catch (error) {
      logger.error(`Ошибка сохранения ответа в MongoDB для chatId ${chatId}: ${error.message}`);
    }

    // Отправка ответа с эффектом "печатания"
    bot.sendChatAction(chatId, "typing");
    await new Promise((resolve) => setTimeout(resolve, calculateTypingTime(response)));
    await bot.sendMessage(chatId, response);
    logger.info(`Ответ отправлен пользователю ${chatId}: "${response}"`);

    // Переход к следующему этапу
    user.stage += 1;

  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от пользователя ${chatId}: ${error.message}`);
    try {
      await bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.");
    } catch (sendError) {
      logger.error(`Ошибка отправки сообщения об ошибке для chatId ${chatId}: ${sendError.message}`);
    }
  }
});

