import logger from './logger.js';

const lastMessages = {};

export const sendMessageWithCheck = async (bot, chatId, message) => {
  try {
    if (!message || typeof message !== 'string') {
      logger.warn(`Invalid message for chatId ${chatId}`);
      return;
    }

    if (lastMessages[chatId] === message) {
      logger.info(`Duplicate message detected for chatId ${chatId}, skipping send.`);
      return;
    }

    await bot.sendMessage(chatId, message);
    lastMessages[chatId] = message;
    logger.info(`Message sent to chatId ${chatId}: ${message}`);
  } catch (error) {
    logger.error(`Error sending message to chatId ${chatId}: ${error.message}`);
  }
};
