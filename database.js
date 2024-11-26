const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');

async function connectDB() {
  await client.connect();
  console.log('Успешное подключение к MongoDB');
  return client.db('telegramBot');
}

module.exports = connectDB;

const saveUserMessage = async (chatId, message) => {
  const collection = db.collection('userMessages');
  await collection.updateOne(
    { userId: chatId },
    { $push: { messages: message } },
    { upsert: true }
  );
  logger.info(`Сообщение "${message}" сохранено для пользователя ${chatId}`);
};
