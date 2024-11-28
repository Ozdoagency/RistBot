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

// Промпт-инструкция
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

// Telegram Bot Initialization
const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);

// Функция для отправки запроса в Gradio API
async function sendToGradio(message) {
  try {
    logger.info(`Отправка запроса к Gradio API: "${message}" с инструкцией: "${SYSTEM_PROMPT}"`);

    // Подключение к Gradio Space
    const client = await Client.connect(GRADIO_SPACE);

    // Выполнение запроса
    const result = await client.predict('/chat', {
      message: message,
      system_message: SYSTEM_PROMPT,
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
  const textResponse = typeof response === 'string' ? response : String(response);
  const cleanedResponse = textResponse.replace(/\(.*?\)/g, '').trim();

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
    const botReply = await sendToGradio(userMessage);
    const formattedReply = await formatGradioResponse(botReply);
    await sendMessage(chatId, formattedReply);
    logger.info(`Отправка ответа для chatId ${chatId}: "${formattedReply}"`);
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
