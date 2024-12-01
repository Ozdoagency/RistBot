import dialogStages from './prompts.js';
import { sendSummaryToSecondBot } from './summaryHandler.js';
import { sendMessageWithCheck } from './messageUtils.js';
import logger from './logger.js';

// Добавляем новую функцию для отправки в группу
const sendNotificationToGroup = async (bot, summary) => {
  try {
    const GROUP_CHAT_ID = '-4522204925'; // Используем ID напрямую
    
    const groupMessage = `🎯 Новая заявка!\n\n` +
      `Цель: ${summary.goal}\n` +
      `Класс: ${summary.grade}\n` +
      `Темы: ${summary.knowledge}\n` +
      `Время: ${summary.date}\n` +
      `Телефон: ${summary.phone}`;

    const result = await bot.sendMessage(GROUP_CHAT_ID, groupMessage);
    logger.info(`Уведомление успешно отправлено в групповой чат: ${GROUP_CHAT_ID}`);
    return result;
  } catch (error) {
    logger.error(`Ошибка отправки в групповой чат: ${error.message}`);
    throw error;
  }
};

const generateEmotionalJoinText = (context) => {
  const responses = [
    "Отлично! 😊",
    "Здорово! 👍",
    "Понял вас! 👌",
    "Спасибо за ответ! 🌟",
  ];
  // Здесь можно добавить логику для генерации текста на основе контекста
  return responses[Math.floor(Math.random() * responses.length)];
};

const sendEmotionalJoinText = async (bot, chatId, context) => {
  const joinText = generateEmotionalJoinText(context);
  await sendMessageWithCheck(bot, chatId, joinText);
};

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

    // Отправляем эмоциональное присоединение
    await sendEmotionalJoinText(bot, chatId, userMessage);

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
        knowledge: user.data.knowledge || "Не указано",
        date: user.data.date || "Не указано",
        phone: user.data.phone || "Не указано"
      };

      // Отправляем уведомление в группу с обработкой ошибок
      try {
        await sendNotificationToGroup(bot, summary);
      } catch (notificationError) {
        logger.error(`Не удалось отправить уведомление в группу: ${notificationError.message}`);
        // Продолжаем выполнение, даже если отправка в группу не удалась
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
