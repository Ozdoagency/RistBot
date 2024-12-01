import dialogStages from './prompts.js';
import { sendSummaryToSecondBot } from './summaryHandler.js';
import { sendMessageWithCheck } from './messageUtils.js';
import logger from './logger.js';

export const askNextQuestion = async (chatId, userState, bot) => {
  try {
    // Проверка существования и инициализация данных пользователя
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

    // Обновляем данные пользователя на текущем этапе
    const currentStage = dialogStages.questions[user.stage];
    if (currentStage) {
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
          break;
      }
    }

    if (!user.data) {
      user.data = {}; // Инициализация данных пользователя
    }
    if (user.stage >= dialogStages.questions.length) {
      user.stage = dialogStages.questions.length - 1;
    }

    try {
      if (!user.askedPhone && user.stage >= dialogStages.questions.length - 1) {
        // Обяза��ельно спрашиваем номер телефона
        const phoneQuestion = dialogStages.questions.find((q) => q.stage === "Сбор информации - Подтверждение времени");
        await sendMessageWithCheck(bot, chatId, phoneQuestion.text);
        user.askedPhone = true; // Помечаем, что вопрос про телефон задан
        logger.info(`Вопрос про номер телефона задан для chatId ${chatId}`);
      } else if (user.stage < dialogStages.questions.length - 1) {
        // Задаём остальные вопросы
        const question = dialogStages.questions[user.stage];
        let questionText = question.text;
        
        if (question.isTemplate) {
          // Адаптируем текст под контекст, если это шаблон
          const contextualText = await adaptTextToContext(
            questionText,
            user.data,
            question.contextRules
          );
          questionText = contextualText || questionText;
        }
        
        if (question.joinText) {
          await sendMessageWithCheck(bot, chatId, question.joinText);
        }
        await sendMessageWithCheck(bot, chatId, questionText);
        user.stage += 1; // Обновляем этап
        logger.info(`Этап обновлён для chatId ${chatId}: ${user.stage}`);
      } else {
        // Все вопросы завершены
        const summary = {
          goal: user.data.goal || "Не указано",
          grade: user.data.grade || "Не указано",
          knowledge: user.data.knowledge || "Не указано",
          date: user.data.date || "Не указано",
          phone: user.data.phone || "Не указано",
        };

        logger.info(`Все вопросы завершены для chatId ${chatId}.`);
        await sendSummaryToSecondBot(bot, summary);

        await sendMessageWithCheck(bot, chatId, "Спасибо! Мы собрали все данные. Наш менеджер свяжется с вами.");
        delete userState[chatId]; // Удаляем состояние пользователя
      }
    } catch (error) {
      logger.error(`Ошибка в askNextQuestion для chatId ${chatId}: ${error.message}`);
    }
  } catch (error) {
    logger.error(`Ошибка в askNextQuestion для chatId ${chatId}: ${error.message}`);
    throw error;
  }
};
