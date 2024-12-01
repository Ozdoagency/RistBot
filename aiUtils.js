
import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from './logger.js';

const config = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'Ваш_Gemini_API_Key',
  GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
};

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export const generateTextWithAI = async (prompt) => {
  try {
    logger.info(`Отправка запроса в Gemini API: "${prompt}"`);
    const result = await model.generateContent(prompt);

    if (result.response && result.response.candidates && result.response.candidates.length > 0) {
      const reply = result.response.candidates[0].content.parts[0].text || 'Ответ отсутствует.';
      logger.info(`Ответ от Gemini API: "${reply}"`);
      return reply;
    } else {
      logger.warn(`Gemini API не вернул кандидатов.`);
      return 'Извините, я не смог обработать ваш запрос. Gemini API не вернул текст.';
    }
  } catch (error) {
    logger.error(`Ошибка Gemini API: ${error.message}`);
    throw new Error(`Произошла ошибка при обработке запроса: ${error.message}`);
  }
};