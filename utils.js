const openai = require('openai'); // Убедитесь, что OpenAI правильно импортирован

// Генерация ответа с повторной попыткой
const generateResponseWithRetry = async (prompt, contextType) => {
  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.7,
      max_tokens: 100,
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    throw new Error(`Ошибка генерации ${contextType}: ${error.message}`);
  }
};

// Генерация случайной задержки для эффекта "печатания" (от 3 до 6 секунд)
const getThinkingDelay = () => {
  return Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000; // Увеличена задержка перед "печатанием"
};

// Генерация времени "печатания" на основе длины текста (до 20 секунд максимум)
const calculateTypingTime = (text) => {
  const words = text.split(' ').length;
  const baseTime = 3; // Базовое время в секундах
  return Math.min(baseTime + words * 0.7, 20) * 1000; // Скорость: 0.7 сек/слово, максимум 20 сек
};

module.exports = {
  generateResponseWithRetry,
  getThinkingDelay,
  calculateTypingTime,
};
