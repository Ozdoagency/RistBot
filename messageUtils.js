import logger from './logger.js';

const lastMessages = new Map(); // Используем Map вместо объекта
const MESSAGE_TIMEOUT = 1000; // Тайм-аут между сообщениями в мс

export const sendMessageWithCheck = async (bot, chatId, message) => {
  try {
    // Проверка входных параметров
    if (!bot || !chatId) {
      logger.error('Отсутствуют обязательные параметры bot или chatId');
      return;
    }

    if (!message || typeof message !== 'string') {
      logger.warn(`Некорректное сообщение для chatId ${chatId}`);
      return;
    }

    // Проверка на дубликат сообщения
    const lastMessage = lastMessages.get(chatId);
    if (lastMessage && lastMessage.text === message && 
        (Date.now() - lastMessage.timestamp) < MESSAGE_TIMEOUT) {
      logger.info(`Пропуск дублирующего сообщения для chatId ${chatId}`);
      return;
    }

    // Отправка сообщения
    await bot.sendMessage(chatId, message);
    
    // Сохранение информации о последнем сообщении
    lastMessages.set(chatId, {
      text: message,
      timestamp: Date.now()
    });

    logger.info(`Сообщение успешно отправлено для chatId ${chatId}`);

    // Очистка старых сообщений
    setTimeout(() => {
      lastMessages.delete(chatId);
    }, MESSAGE_TIMEOUT);

  } catch (error) {
    logger.error(`Ошибка при отправке сообщения для chatId ${chatId}: ${error.message}`);
    throw error; // Пробрасываем ошибку для обработки выше
  }
};
