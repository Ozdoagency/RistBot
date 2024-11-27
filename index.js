import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import express from 'express';
import bodyParser from 'body-parser';

// Переменные окружения
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7733244277:AAFa1YylutZKqaEw0LjBTDRKxZymWz91LPs';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://ristbot.onrender.com';
const HF_ACCESS_TOKEN = process.env.HF_ACCESS_TOKEN || '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';
const HF_MODEL = 'bigscience/bloom-560m'; // Генеративная модель
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

// Инициализация бота
const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);

// Функция для генерации ответов через Hugging Face API
async function sendToHuggingFace(prompt, retries = 3) {
  try {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt, // Используем ввод без [MASK]
        parameters: {
          max_length: 150, // Максимальная длина ответа
          temperature: 0.7, // Случайность генерации
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hugging Face API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.generated_text || 'Ошибка при генерации текста. Попробуйте позже.';
  } catch (error) {
    if (retries > 0 && error.message.includes('503')) {
      console.log('Модель загружается, повторная попытка...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Ждем 5 секунд перед повторной попыткой
      return sendToHuggingFace(prompt, retries - 1);
    }
    console.error(`Ошибка взаимодействия с Hugging Face API: ${error.message}`);
    return 'Извините, произошла ошибка при обработке вашего запроса.';
  }
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Добро пожаловать! Отправьте мне сообщение, и я отвечу с помощью модели Hugging Face.');
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (userMessage.startsWith('/')) return; // Игнорируем команды

  try {
    const botReply = await sendToHuggingFace(userMessage);
    bot.sendMessage(chatId, botReply);
  } catch (error) {
    bot.sendMessage(chatId, 'Извините, произошла ошибка при обработке вашего сообщения.');
    console.error(`Ошибка при обработке сообщения от chatId ${chatId}: ${error.message}`);
  }
});

// Создание Express-сервера
const app = express();
app.use(bodyParser.json());

// Обработка Webhook от Telegram
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Проверка доступности сервера
app.get('/', (req, res) => {
  res.send('Сервер работает! 🚀');
});

// Запуск сервера
app.listen(process.env.PORT || 3000, () => {
  console.log(`Сервер запущен на порту ${process.env.PORT || 3000}`);
});
