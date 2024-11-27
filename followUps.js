import { getDb } from './mongodb.js';
import { generateResponseWithRetry } from './utils.js';
import logger from './logger.js'; // Логирование (если используется)

// Функция для генерации текста фоллоу-апа через HugFace
export const generateFollowUpMessage = async (chatId, stage) => {
  const prompt = `
  Ты — эксперт по продажам и ведению диалога с клиентами. Клиент перестал отвечать на сообщения. 
  Ты используешь лучшие техники продаж и вовлечения, чтобы вернуть клиента в диалог. 
  Вот этапы твоих действий:

  1. **Эмпатия и дружелюбие.** Убедись, что клиент чувствует комфорт.
  2. **Добавь ценность.** Напомни, какую проблему решит твой продукт или услуга.
  3. **Уменьши напряжение.** Предложи лёгкий способ продолжить разговор.

  Ситуация:
  - Услуга: Онлайн-уроки математики.
  - Цель: Записать ребёнка клиента на бесплатные пробные уроки.

  Твоя задача — написать **${stage} фоллоу-ап**, который привлечет внимание клиента и вовлечёт его в диалог.
  Сообщение должно быть коротким, понятным, но эффективным.`;

  try {
    const response = await generateResponseWithRetry(prompt, 'followUp');
    logger.info(`Сгенерирован текст фоллоу-апа для ${stage} стадии: ${response}`);
    return response;
  } catch (error) {
    logger.error(`Ошибка при генерации фоллоу-апа: ${error.message}`);
    return "Мы заметили, что вы не ответили. Напишите, если у вас есть вопросы! 😊"; // Резервный текст
  }
};

// Функция отправки фоллоу-апов
export const sendFollowUps = async (bot, chatId) => {
  const db = getDb(); // Получение базы данных
  const collection = db.collection('followUps'); // Коллекция для хранения состояния фоллоу-апов
  const timers = {};

  // Проверка, был ли пользователь квалифицирован
  const isQualified = await collection.findOne({ userId: chatId, qualified: true });
  if (isQualified) {
    logger.info(`Пользователь ${chatId} уже квалифицирован, фоллоу-апы не отправляются.`);
    return null; // Фоллоу-апы не отправляются
  }

  // Первый фоллоу-ап через 15 минут
  timers.first = setTimeout(async () => {
    const followUpMessage = await generateFollowUpMessage(chatId, "первого");
    bot.sendMessage(chatId, followUpMessage);
    logger.info(`Первый фоллоу-ап отправлен пользователю ${chatId}`);
    await collection.updateOne(
      { userId: chatId },
      { $set: { firstFollowUpSent: true } },
      { upsert: true }
    );
  }, 15 * 60 * 1000); // 15 минут

  // Второй фоллоу-ап через 2 часа
  timers.second = setTimeout(async () => {
    const followUpMessage = await generateFollowUpMessage(chatId, "второго");
    bot.sendMessage(chatId, followUpMessage);
    logger.info(`Второй фоллоу-ап отправлен пользователю ${chatId}`);
    await collection.updateOne(
      { userId: chatId },
      { $set: { secondFollowUpSent: true } },
      { upsert: true }
    );
  }, 2 * 60 * 60 * 1000); // 2 часа

  // Третий фоллоу-ап через 5 часов
  timers.third = setTimeout(async () => {
    const followUpMessage = await generateFollowUpMessage(chatId, "третьего");
    bot.sendMessage(chatId, followUpMessage);
    logger.info(`Третий фоллоу-ап отправлен пользователю ${chatId}`);
    await collection.updateOne(
      { userId: chatId },
      { $set: { thirdFollowUpSent: true } },
      { upsert: true }
    );
  }, 5 * 60 * 60 * 1000); // 5 часов

  return timers;
};
