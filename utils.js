import fetch from 'node-fetch'; // Используем fetch для запросов к Hugging Face API

// Переменные окружения для Hugging Face
const HF_ACCESS_TOKEN = process.env.HF_ACCESS_TOKEN || "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";
const HF_API_URL = `https://api-inference.huggingface.co/models/DeepPavlov/rubert-base-cased-conversational`; // Убедитесь, что модель указана корректно

// Функция для отправки запросов к Hugging Face API
export const generateResponseFromHuggingFace = async (prompt) => {
  try {
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 150, // Максимальная длина ответа
          temperature: 0.7, // Контроль случайности
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка Hugging Face API: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.generated_text || "Ошибка при генерации текста. Попробуйте позже.";
  } catch (error) {
    throw new Error(`Ошибка взаимодействия с Hugging Face API: ${error.message}`);
  }
};

// Генерация ответа с повторной попыткой
export const generateResponseWithRetry = async (prompt, contextType) => {
  try {
    const response = await generateResponseFromHuggingFace(prompt);
    return response;
  } catch (error) {
    throw new Error(`Ошибка генерации ${contextType}: ${error.message}`);
  }
};

// Генерация случайной задержки для эффекта "печатания" (от 3 до 6 секунд)
export const getThinkingDelay = () => {
  return Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000; // Увеличена задержка перед "печатанием"
};

// Генерация времени "печатания" на основе длины текста (до 20 секунд максимум)
export const calculateTypingTime = (text) => {
  const words = text.split(' ').length;
  const baseTime = 3; // Базовое время в секундах
  return Math.min(baseTime + words * 0.7, 20) * 1000; // Скорость: 0.7 сек/слово, максимум 20 сек
};
