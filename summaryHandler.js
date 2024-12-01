import fetch from 'node-fetch';
import logger from './logger.js';
import dialogStages from './prompts.js';

export const sendSummaryToSecondBot = async (bot, summary) => {
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
        chat_id: SECOND_BOT_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка при отправке данных: ${response.status} - ${errorText}`);
    }

    logger.info("Данные успешно отправлены в группу!");
  } catch (error) {
    logger.error(`Ошибка при отправке данных во второй бот: ${error.message}`);
  }
};
