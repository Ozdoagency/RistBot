import dialogStages from './prompts.js';
import { sendSummaryToSecondBot } from './summaryHandler.js';
import { sendMessageWithCheck } from './messageUtils.js';
import logger from './logger.js';

export const askNextQuestion = async (chatId, userState, bot, userMessage) => {
  try {
    // Получаем или создаем состояние пользователя
    if (!userState[chatId]) {
      userState[chatId] = {
        stage: 0,
        data: {
          goal: null,
          grade: null,
          knowledge: null,
          date: null,
          phone: null
        },
        askedPhone: false
      };
    }

    const user = userState[chatId];
    const currentStage = dialogStages.questions[user.stage];

    // Сохраняем ответ пользователя в соответствующее поле
    if (userMessage && currentStage) {
      switch (currentStage.stage) {
        case "Цель обучения":
          user.data.goal = userMessage;
          break;
        case "Класс ученика":
          user.data.grade = userMessage;
          break;
        case "Темы":
          user.data.knowledge = userMessage;
          break;
        case "Удобное время":
          user.data.date = userMessage;
          break;
        case "Сбор информации - Подтверждение времени":
          user.data.phone = userMessage;
          user.askedPhone = true;
          break;
      }
    }

    // Отправляем сообщение с эмоциональным присоединением
    if (currentStage && currentStage.joinText) {
      await sendMessageWithCheck(bot, chatId, currentStage.joinText);
    }

    // Переходим к следующему этапу
    user.stage++;

    // Получаем следующий этап
    const nextStage = dialogStages.questions[user.stage];

    // Если есть следующий этап, отправляем его вопрос
    if (nextStage) {
      await sendMessageWithCheck(bot, chatId, nextStage.text);
      logger.info(`Отправлен вопрос этапа ${nextStage.stage} для chatId ${chatId}`);
    } else {
      // Если вопросы закончились, отправляем итоговое сообщение
      const summary = {
        goal: user.data.goal || "Не указано",
        grade: user.data.grade || "Не указано",
        knowledge: user.data.knowledge || "Не ук��зано",
        date: user.data.date || "Не указано",
        phone: user.data.phone || "Не указано"
      };

      // Отправляем сообщение в группу
      const groupMessage = `🎯 Новая заявка!\n\n` +
        `Цель: ${summary.goal}\n` +
        `Класс: ${summary.grade}\n` +
        `Темы: ${summary.knowledge}\n` +
        `Время: ${summary.date}\n` +
        `Телефон: ${summary.phone}`;

      try {
        await bot.sendMessage(process.env.GROUP_CHAT_ID, groupMessage);
        logger.info(`Уведомление отправлено в групповой чат`);
      } catch (error) {
        logger.error(`Ошибка отправки в групповой чат: ${error.message}`);
      }

      await sendSummaryToSecondBot(bot, summary);
      await sendMessageWithCheck(bot, chatId, "Спасибо за ваши ответы! Мы свяжемся с вами в ближайшее время для подтверждения записи. 😊");
      
      // Очищаем состояние пользователя
      delete userState[chatId];
    }

  } catch (error) {
    logger.error(`Ошибка в askNextQuestion для chatId ${chatId}: ${error.message}`);
    throw error;
  }
};
