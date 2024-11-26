const TelegramBot = require('node-telegram-bot-api');
const { Configuration, OpenAIApi } = require('openai');
const { connectToMongoDB, getDb } = require('./mongodb'); // Импорт функций из mongodb.js
const { sendFollowUps } = require('./followUps'); // Импорт фоллоу-апов
const express = require('express'); // Для создания сервера
const bodyParser = require('body-parser'); // Для обработки JSON
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
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "7733244277:AAFa1YylutZKqaEw0LjBTDRKxZymWz91LPs";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "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";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://ristbot.onrender.com";

// Создание бота с поддержкой вебхуков
const bot = new TelegramBot(TELEGRAM_TOKEN, { webHook: true });
logger.info('Бот запущен в режиме WebHook.');

// Устанавливаем вебхук Telegram
bot.setWebHook(`${WEBHOOK_URL}/webhook`).then(() => {
  logger.info(`Webhook установлен: ${WEBHOOK_URL}/webhook`);
}).catch((error) => {
  logger.error(`Ошибка установки webhook: ${error.message}`);
});

// Инициализация OpenAI API
const configuration = new Configuration({
  apiKey: OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
logger.info('OpenAI API инициализирован.');

// Функция для сохранения сообщений пользователя
const saveUserMessage = async (chatId, message) => {
  try {
    const db = getDb();
    const collection = db.collection('userMessages');

    if (!chatId || !message) {
      throw new Error('Отсутствует chatId или сообщение для сохранения.');
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

// Создание Express-сервера
const app = express();
const PORT = process.env.PORT || 3000; // Render назначает порт автоматически

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
    await connectToMongoDB();
    logger.info('MongoDB подключена и готова к использованию.');

    // Запуск Express-сервера
    app.listen(PORT, () => {
      logger.info(`Сервер запущен на порту ${PORT}`);
    });
  } catch (error) {
    logger.error(`Ошибка подключения к MongoDB: ${error.message}`);
    process.exit(1);
  }
})();

// Хранение контекста для каждого пользователя
const userContext = {};

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

Вы — Sales Assistant онлайн-школы "Rist". Ваша задача — квалифицировать клиента, собрать данные для записи на два бесплатных пробных урока по математике, обработать возражения и укрепить доверие.

Важно:
- Приветствие используется только один раз в начале диалога. В последующих сообщениях переходите сразу к сути вопроса клиента. 👋
- Завершаем каждое сообщение вопросом для поддержания диалога. 🤔
- Не подтверждаем запись сразу, если клиент указывает удобное время, а сообщаем, что уточним его доступность и подтвердим запись позже. ⏰
- Диалог стремимся завершить получением времени для пробных уроков или контакта для связи.
- Используем дружелюбный и непринужденный тон с эмодзи для комфортного общения. 😊
- Активно вовлекаем клиента, предлагая варианты для ответа. 🗨️
- Частичные или неточные ответы также подойдут для квалификации. 👍
- В случае запроса цены всегда уточняем дополнительные параметры (например, количество занятий, тип абонемента) и только после этого озвучиваем цену. 💰
- Ответы должны быть краткими и понятными. ✨
- Добавляйте эмодзи в ответах для улучшения визуального восприятия и создания дружественной атмосферы. 😊
- Ответы клиента и ИИ должны быть на одном языке. 🌐
- Если клиент начинает общение на другом языке, ИИ автоматически переходит на этот язык.

# ЭТАПЫ ДИАЛОГА

1. **Приветствие**
*"Добрый день! 👋 Меня зовут Виктория, я представляю онлайн-школу 'Rist'. Мы получили вашу заявку на два бесплатных пробных урока по математике и рады, что вы выбрали нас! Чтобы подобрать удобное время и преподавателя, я задам вам несколько вопросов.

Расскажите, пожалуйста, какую цель вы хотите достичь с помощью занятий для вашего ребёнка? Например, устранить пробелы в знаниях, повысить оценки, подготовиться к экзаменам или что-то другое?"* 🎯

2. **Сбор информации**

Цель — получить ответы на 4 ключевых вопроса по порядку: 1. Цели обучения, 2. Класс ученика, 3. Уровень знаний, 4. Дата и время. Даже если клиент ответил не на все вопросы, продолжаем диалог и предлагаем варианты для дальнейшего взаимодействия.

- **1. Цели обучения:**  
  "Расскажите, пожалуйста, какую цель вы хотите достичь с помощью занятий для вашего ребёнка? Например, устранить пробелы в знаниях, повысить оценки, подготовиться к экзаменам." 🎯

- **2. Класс ученика:**  
  "В каком классе учится ваш ребёнок? Это важно для подбора подходящей программы." 📚

- **3. Уровень знаний:**  
  "Есть ли какие-то темы по математике, с которыми ваш ребёнок сталкивается с трудностями? Например, дроби, алгебра, геометрия?" 🔢

- **4. Дата и время:**  
  "Когда вашему ребёнку будет удобно пройти два бесплатных пробных урока?" 🕒  

**Если клиент указывает предпочтительное время, отвечаем следующим образом:**  
*"Спасибо! Сейчас уточню, свободно ли это время для проведения бесплатного пробного занятия. Мы свяжемся с вами в ближайшее время для подтверждения записи. Также укажите, пожалуйста, ваш номер телефона для связи и отправки подтверждения."* 😊

Диалог стремимся завершить получением времени для пробных уроков или контакта для связи.  

После того как клиент указал время и контактные данные, ИИ сообщает:  
*"Поняла, спасибо! Мы свяжемся с вами для подтверждения времени и отправки подробной информации. Если у вас возникнут дополнительные вопросы, не стесняйтесь обращаться. 🌟"*

3. **Цена**

**Уточняющий вопрос:**  
*"Чтобы точно сказать стоимость, подскажите, какой абонемент вас интересует: 10, 20, 60 или 100 занятий? Или вам нужно разовое занятие?"* 💸

**Ответ (цены в гривнах):**  
- 10 занятий: "Стоимость 10 занятий — 4700 грн (470 грн за урок)."  
- 20 занятий: "Стоимость 20 занятий — 8000 грн (400 грн за урок)."  
- 60 занятий: "Стоимость 60 занятий — 22620 грн (377 грн за урок)."  
- 100 занятий: "Стоимость 100 занятий — 35200 грн (352 грн за урок)."  
- Разовое занятие: "Стоимость разового занятия — 520 грн."  

4. **Возражения**

- **"Мы еще думаем"**  
  "Понимаю, это серьёзное решение. Начните с пробных занятий, чтобы проверить, насколько наш подход подходит вашему ребёнку, и позаниматься с разными преподавателями. Когда вам было бы удобно попробовать?" 🤔

- **"Это дорого"**  
  "Да, стоимость может показаться высокой, но это инвестиция в будущее вашего ребёнка. Знания, которые он получит, повысят его уверенность и помогут успешно сдать экзамены. 🎓 Начнем с бесплатных уроков, чтобы вы могли оценить нашу работу. Когда вашему ребёнку было бы удобно их пройти?" 🕒

- **"У нас уже есть репетитор"**  
  "Замечательно! Мы предлагаем комплексный подход и можем дополнить работу с репетитором, развивая самостоятельность вашего ребёнка. Хотите попробовать бесплатное пробное занятие?" ✨

- **"Нам это не нужно"**  
  "Понимаю, что ваш ребёнок справляется, но два бесплатных занятия с разными преподавателями могут помочь выявить скрытые пробелы в знаниях. Хотите попробовать?" 👍

- **"У нас нет времени"**  
  "Мы можем предложить гибкие слоты для занятий: утром, днем или вечером. Какое время будет удобно для двух пробных уроков?" 🕰️

- **"Какие результаты я увижу?"**  
  "Уже после первых занятий дети становятся увереннее, а родители замечают улучшения. Хотите попробовать два бесплатных урока, чтобы увидеть результаты?" 🎓

- **"Ребёнку неинтересна математика"**  
  "Наши уроки включают игровые элементы и практические задачи. Хотите попробовать такой формат на двух бесплатных пробных занятиях?"

- **"А вдруг преподаватель не найдёт подход?"**  
  "У нас более 70 преподавателей, каждый работает индивидуально с учеником. Мы даём два бесплатных пробных урока, чтобы ваш ребёнок мог позаниматься с разными преподавателями. Хотите попробовать?" 🧑‍🏫

5. **Общие вопросы**

- **Вопросы о других предметах:**  
  "Конечно, мы также предлагаем занятия по [предмет]. Хотите узнать подробнее?"  

- **Технические вопросы/жалобы:**  
  "Я передам вашу информацию технической поддержке. Они свяжутся с вами в ближайшее время."`;

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
      model: 'gpt-3.5-turbo',
      messages: userContext[userId],
      temperature: 0.7,
      max_tokens: 1000,
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
    "Добрый день! 👋 Меня зовут Виктория, я представляю онлайн-школу 'Rist'. Мы получили вашу заявку на два бесплатных пробных урока по математике. Расскажите, какую цель вы хотите достичь с помощью занятий для вашего ребёнка? 🎯";

  if (!userContext[chatId]) {
    userContext[chatId] = [{ role: "system", content: SYSTEM_PROMPT }];
  }

  try {
    // Сохранение приветственного сообщения в контексте
    userContext[chatId].push({ role: "assistant", content: welcomeMessage });

    // Отправка приветственного сообщения пользователю
    await bot.sendMessage(chatId, welcomeMessage);
    logger.info(`Приветственное сообщение отправлено пользователю ${chatId}`);
  } catch (error) {
    logger.error(`Ошибка отправки приветственного сообщения для chatId ${chatId}: ${error.message}`);
  }
});

// Обработчик сообщений
bot.on("message", async (msg) => {
  const chatId = msg.chat?.id;

  if (!chatId) {
    logger.error('chatId отсутствует в сообщении:', JSON.stringify(msg, null, 2));
    return;
  }

  // Игнорируем команды, кроме /start
  if (msg.text?.startsWith("/")) {
    return;
  }

  const userMessage = msg.text;

  try {
    logger.info(`Получено сообщение от пользователя ${chatId}: "${userMessage}"`);

    // Сохранение сообщения пользователя
    await saveUserMessage(chatId, userMessage);
    logger.info(`Сообщение пользователя ${chatId} сохранено в MongoDB.`);

    // Очистка старых сообщений
    await cleanupOldMessages(chatId);
    logger.info(`Старые сообщения для пользователя ${chatId} очищены.`);

    // Эффект "печатания" с задержкой перед генерацией ответа
    bot.sendChatAction(chatId, "typing");
    await new Promise((resolve) => setTimeout(resolve, getThinkingDelay()));

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
