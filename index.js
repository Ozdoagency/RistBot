const TelegramBot = require('node-telegram-bot-api');
const { Configuration, OpenAIApi } = require('openai');
const { connectToMongoDB, getDb } = require('./mongodb');
const { sendFollowUps } = require('./followUps');
const express = require('express');
const bodyParser = require('body-parser');
const winston = require('winston');

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
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "YOUR_OPENAI_API_KEY";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://your_domain.com";

// Инициализация Telegram Bot и OpenAI
const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);
const configuration = new Configuration({ apiKey: OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

const lastMessages = {};
const userContext = {};
const userState = {};

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
  const user = userState[chatId] || { stage: 0, data: {} };
  userState[chatId] = user;

  const stages = [
    "Расскажите, пожалуйста, какую цель вы хотите достичь с помощью занятий для вашего ребёнка? Например, устранить пробелы в знаниях, повысить оценки, подготовиться к экзаменам. 🎯",
    "В каком классе учится ваш ребёнок? Это важно для подбора подходящей программы. 📚",
    "Есть ли какие-то темы по математике, с которыми ваш ребёнок сталкивается с трудностями? Например, дроби, алгебра, геометрия? 🔢",
    "Когда вашему ребёнку будет удобно пройти два бесплатных пробных урока? 🕒",
    "Укажите, пожалуйста, ваш номер телефона для связи и отправки подтверждения. ☎️",
  ];

  try {
    if (user.stage < stages.length) {
      const question = stages[user.stage];
      await sendMessageWithCheck(chatId, question); // Используйте проверку
      user.stage += 1; // Обновление состояния
      logger.info(`Этап обновлен для chatId ${chatId}: ${user.stage}`);
    } else {
      const summary = {
        goal: user.data.goal || "Не указано",
        grade: user.data.grade || "Не указано",
        knowledge: user.data.knowledge || "Не указано",
        date: user.data.date || "Не указано",
        phone: user.data.phone || "Не указано",
      };

      logger.info(`Все этапы завершены для chatId ${chatId}. Отправляем данные.`);
      await sendSummaryToSecondBot(summary);

      await sendMessageWithCheck(chatId, "Спасибо! Мы собрали все данные. Наш менеджер свяжется с вами.");
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


// Ваш SYSTEM_PROMPT
const SYSTEM_PROMPT = `# РОЛЬ И ЗАДАЧА

Вы — Sales Assistant онлайн-школы "Rist". Ваша задача — квалифицировать клиента и собрать данные для записи на пробные уроки по математике. Отвечайте кратко, задавайте только важные вопросы, используя дружелюбный тон с эмодзи. 🌟

Правила общения:
1. Приветствие используется один раз в начале диалога. Далее переходите сразу к сути. 👋
2. Завершайте каждое сообщение вопросом для продолжения диалога. 🤔
3. Если клиент указывает время, уточните его доступность и сообщите, что подтвердите позже. ⏰
4. Цель диалога — получить время для уроков и контакт для связи.
5. Используйте краткие, понятные ответы и вовлекайте клиента вариантами. 🗨️
6. При запросе цены уточняйте параметры (например, абонемент или разовое занятие) перед ответом. 💰
7. Автоматически отвечайте на языке клиента. 🌐


# ЭТАПЫ ДИАЛОГА

1. **Приветствие**  
*"Добрый день! 👋 Меня зовут Виктория, я представляю онлайн-школу 'Rist'. Мы рады, что вы выбрали нас! Чтобы подобрать время для пробных уроков, мне нужно задать пару вопросов."*

*"Расскажите, пожалуйста, какую цель вы хотите достичь с помощью занятий? Например, устранить пробелы, повысить оценки или подготовиться к экзаменам."* 🎯

2. **Сбор информации**  
Цель — получить ответы на 4 вопроса: цель обучения, класс ученика, темы, которые вызывают трудности, и удобное время.  

- **Цель обучения:**  
  "Какая основная цель занятий для вашего ребёнка? Например, повысить оценки, устранить пробелы или подготовиться к экзаменам." 🎯

- **Класс ученика:**  
  "В каком классе учится ваш ребёнок?" 📚

- **Темы:**  
  "С какими темами по математике у ребёнка сложности? Например, дроби, алгебра, геометрия?" 🔢

- **Удобное время:**  
  "Когда вашему ребёнку удобно пройти пробные уроки?" 🕒  

Если клиент указывает время:  
*"Спасибо! Сейчас уточню доступность. Мы свяжемся с вами для подтверждения записи. Укажите, пожалуйста, ваш номер телефона для связи."* ☎️  

3. **Подтверждение данных**  
После получения времени и контактов:  
*"Спасибо! Мы свяжемся для подтверждения записи. Если возникнут вопросы, пишите!"* 🌟  

3. **Цена**

Если клиент спрашивает о стоимости:  
*"Стоимость зависит от абонемента. Какой вас интересует: 10, 20, 60 или 100 занятий? Или вам нужно разовое занятие?"* 💸  

**Примерные цены (в гривнах):**  
- 10 занятий: 4700 грн (по 470 грн/урок)  
- 20 занятий: 8000 грн (по 400 грн/урок)  
- 60 занятий: 22620 грн (по 377 грн/урок)  
- 100 занятий: 35200 грн (по 352 грн/урок)  
- Разовое занятие: 520 грн.  

*"Могу рассказать подробнее о программах или помочь выбрать вариант, вам какой вариант больше подходит?"* 😊


4. **Возражения**

- **"Мы еще думаем"**  
  "Понимаю, это серьёзное решение. Попробуйте пробные занятия, чтобы оценить наш подход. Когда вам удобно начать?" 🤔

- **"Это дорого"**  
  "Да, стоимость может казаться высокой, но это инвестиция в будущее ребёнка. Начнём с бесплатных уроков, чтобы вы могли оценить качество. Когда удобно попробовать?" 🎓

- **"У нас уже есть репетитор"**  
  "Отлично! Мы можем дополнить работу репетитора, развивая самостоятельность ребёнка. Хотите попробовать пробный урок?" ✨

- **"Нам это не нужно"**  
  "Понимаю! Но два пробных занятия помогут выявить скрытые пробелы. Хотите попробовать?" 👍

- **"У нас нет времени"**  
  "Мы предлагаем гибкие слоты для занятий: утром, днём или вечером. Какое время будет удобным?" 🕰️

- **"Какие результаты я увижу?"**  
  "После первых занятий дети становятся увереннее, а родители замечают улучшения. Хотите попробовать?" 🎓

- **"Ребёнку неинтересна математика"**  
  "Мы делаем уроки увлекательными, включая игровые элементы. Хотите попробовать такой формат?" 😊

- **"А вдруг преподаватель не найдёт подход?"**  
  "У нас более 70 преподавателей, и мы подберём подходящего. Начните с пробных занятий, чтобы убедиться. Хотите попробовать?" 🧑‍🏫

---

5. **Общие вопросы**

- **Другие предметы:**  
  "Да, мы предлагаем занятия и по другим предметам. Хотите узнать подробнее?"  

- **Технические вопросы/жалобы:**  
  "Передам вашу информацию техподдержке. Они свяжутся с вами в ближайшее время."`;

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

// Генерация ответа через OpenAI API
async function generateResponse(userId, userMessage) {
  try {
    if (!userContext[userId]) {
      userContext[userId] = [{ role: "system", content: SYSTEM_PROMPT }];
    }

    userContext[userId].push({ role: "user", content: userMessage });

    const response = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: userContext[userId],
      temperature: 0.7,
      max_tokens: 500,
    });

    const assistantMessage = response.data.choices[0].message.content;
    userContext[userId].push({ role: "assistant", content: assistantMessage });
    return assistantMessage;
  } catch (error) {
    logger.error(`Ошибка OpenAI API для userId ${userId}: ${error.message}`);
    return "Извините, произошла ошибка при обработке вашего запроса. Попробуйте снова позже.";
  }
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
    "Добрый день! 👋 Меня зовут Виктория, я представляю онлайн-школу 'Rist'. Чтобы начать запись на пробные занятия, я задам вам несколько вопросов. 😊";

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
    const user = userState[chatId] || { stage: 0, data: {} };
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
        user.data.phone = userMessage;
        break;
      default:
        logger.error(`Неизвестный этап для chatId ${chatId}: ${user.stage}`);
        return;
    }

    // Очистка старых сообщений
    await cleanupOldMessages(chatId);
    logger.info(`Старые сообщения для пользователя ${chatId} очищены.`);

    // Эффект "печатания" с задержкой перед генерацией ответа
    bot.sendChatAction(chatId, "typing");
    await new Promise((resolve) => setTimeout(resolve, getThinkingDelay())); // Задержка в правильном месте

    // Генерация ответа с использованием OpenAI API
    const response = await generateResponse(chatId, userMessage);

    // Сохранение ответа в MongoDB
    try {
      const db = getDb();
      const collection = db.collection('userContext');
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

  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от пользователя ${chatId}: ${error.message}`);
    try {
      await bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.");
    } catch (sendError) {
      logger.error(`Ошибка отправки сообщения об ошибке для chatId ${chatId}: ${sendError.message}`);
    }
  }
});
