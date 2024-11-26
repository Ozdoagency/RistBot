const Queue = require('bull');

const responseQueue = new Queue('responseQueue');

responseQueue.process(async (job) => {
  const { chatId, userMessage, generateResponse } = job.data;
  const response = await generateResponse(userMessage);
  bot.sendMessage(chatId, response);
});

module.exports = responseQueue;
