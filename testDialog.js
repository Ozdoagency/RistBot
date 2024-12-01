import TelegramBot from 'node-telegram-bot-api';
import { config } from './index.js'; // Импортируйте конфигурацию из основного файла

const bot = new TelegramBot(config.TELEGRAM_TOKEN, { polling: true });

const testChatId = 123456789; // Замените на реальный chat ID для тестирования

const testScenarios = [
  {
    description: "Позитивный сценарий",
    messages: [
      { text: '/start', delay: 1000 },
      { text: 'Хочу повысить оценки �� подготовиться к экзаменам', delay: 2000 },
      { text: '10 класс', delay: 2000 },
      { text: 'интегралы, производные, логарифмы', delay: 2000 },
      { text: 'Вечер', delay: 2000 },
    ]
  },
  {
    description: "Негативный сценарий",
    messages: [
      { text: '/start', delay: 1000 },
      { text: 'У нас ухудшились оценки, пробелы большие по алгебре и геометрии', delay: 2000 },
      { text: '5-8 класс', delay: 2000 },
      { text: 'алгебра, геометрия, дроби', delay: 2000 },
      { text: 'День', delay: 2000 },
    ]
  },
  {
    description: "Смешанный сценарий",
    messages: [
      { text: '/start', delay: 1000 },
      { text: 'Хотим устранить пробелы и повысить оценки', delay: 2000 },
      { text: '9 класс', delay: 2000 },
      { text: 'тригонометрия, уравнения, функции', delay: 2000 },
      { text: 'Утро', delay: 2000 },
    ]
  }
];

async function runTestScenario(scenario) {
  console.log(`Запуск сценария: ${scenario.description}`);
  for (const message of scenario.messages) {
    await bot.sendMessage(testChatId, message.text);
    await new Promise(resolve => setTimeout(resolve, message.delay));
  }
  console.log(`Сценарий завершен: ${scenario.description}`);
}

async function runAllTestScenarios() {
  for (const scenario of testScenarios) {
    await runTestScenario(scenario);
  }
  console.log('Все тестовые сценарии завершены.');
  process.exit();
}

runAllTestScenarios();