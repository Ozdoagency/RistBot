import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import { spawn } from 'child_process';

const TELEGRAM_TOKEN = '7733244277:AAFa1YylutZKqaEw0LjBTDRKxZymWz91LPs';
const WEBHOOK_URL = 'https://ristbot.onrender.com';

const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);

// Функция для генерации текста с помощью BLOOM
async function sendToHuggingFace(prompt) {
  return new Promise((resolve, reject) => {
    console.log(`Запускаем Python-скрипт с вводом: ${prompt}`);
    const pythonProcess = spawn('python3', ['bloom_generate.py', prompt]);

    let result = '';
    pythonProcess.stdout.on('data', (data) => {
      console.log(`Python stdout: ${data}`);
      result += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python завершился с кодом ошибки ${code}`);
        reject(`Python завершился с кодом ошибки ${code}`);
      } else {
        console.log(`Результат Python: ${result}`);
        resolve(result.trim());
      }
    });
  });
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
    console.log(`Ответ от Python: ${botReply}`);
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
