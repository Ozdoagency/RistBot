import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

const TELEGRAM_TOKEN = '7733244277:AAFa1YylutZKqaEw0LjBTDRKxZymWz91LPs';
const WEBHOOK_URL = 'https://ristbot.onrender.com';
const HF_API_URL = 'https://api-inference.huggingface.co/models/bigscience/bloom';
const HF_API_TOKEN = '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';
const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);

// Функция для генерации текста через Hugging Face API
async function sendToHuggingFace(prompt) {
  try {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 150,
          temperature: 0.7,
          top_p: 0.9,
          repetition_penalty: 1.2,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hugging Face API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result[0]?.generated_text || 'Ошибка: Невозможно получить текст';
  } catch (error) {
    console.error(`Ошибка при обращении к Hugging Face API: ${error.message}`);
    throw error;
  }
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Добро пожаловать! Напишите мне сообщение, и я отвечу.');
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (userMessage.startsWith('/')) return; // Игнорируем команды

  try {
    console.log(`Получено сообщение от chatId ${chatId}: ${userMessage}`);
    const botReply = await sendToHuggingFace(userMessage);
    console.log(`Ответ от Hugging Face API: ${botReply}`);
    await bot.sendMessage(chatId, botReply);
  } catch (error) {
    console.error(`Ошибка при обработке сообщения от chatId ${chatId}: ${error.message}`);
    await bot.sendMessage(chatId, 'Извините, произошла ошибка при обработке вашего сообщения.');
  }
});

// Создание Express-сервера
const app = express();
app.use(bodyParser.json());

// Обработка Webhook
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