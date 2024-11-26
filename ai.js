const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function generateResponse(context) {
  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: context,
      temperature: 0.7,
      max_tokens: 1000,
    });
    return response.data.choices[0].message.content;
  } catch (error) {
    throw new Error(`Ошибка OpenAI API: ${error.message}`);
  }
}

module.exports = { generateResponse };

async function generateResponseWithRetry(context) {
  let retryCount = 0;
  while (retryCount < 3) {
    try {
      return await generateResponse(context);
    } catch (error) {
      if (error.message.includes('Rate limit')) {
        retryCount++;
        await new Promise((res) => setTimeout(res, 1000));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Превышено количество попыток.');
}
