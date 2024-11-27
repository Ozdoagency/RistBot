import logger from './logger.js';

export const sendMessageWithCheck = async (bot, chatId, message, lastMessages) => {
  if (lastMessages[chatId] === message) {
    logger.info(`Duplicate message detected for chatId ${chatId}, skipping send.`);
    return;
  }

  await bot.sendMessage(chatId, message);
  lastMessages[chatId] = message;
  logger.info(`Message sent to chatId ${chatId}: ${message}`);
};
