const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// ВЪПРОСИ (от учебния материал)
// ============================================================
const QUESTIONS = [
  { q: "Какво представлява проектирането на уеб сайт?",
    a: ["Процес на инсталиране на операционна система.",
        "Процес на определяне на външния вид, структурата и организацията на уеб сайта.",
        "Процес на създаване само на изображения.",
        "Процес на настройване единствено на интернет връзката."], correct: 1 },
  { q: "Какво представлява Wireframe?",
    a: ["Готов програмен код на уеб сайта.",
        "Инструмент за проверка на интернет връзката.",
        "Структурен план, показващ разположението на елементите в уеб страницата.",
        "Графичен редактор за обработка на снимки."], correct: 2 },
  { q: "Кой вид структура организира уеб страниците в нива, подобно на пирамида?",
    a: ["Линейна структура.", "Мрежова структура.",
        "Хибридна структура.", "Йерархична структура."], correct: 3 },
  { q: "Коя е основната цел на достъпността на уеб страниците?",
    a: ["Да направи сайта достъпен и използваем за различни потребители, включително хора с увреждания.",
        "Да увеличи броя на изображенията в сайта.",
        "Да ограничи навигацията в уеб страницата.",
        "Да премахне всички текстове от сайта."], correct: 0 },
  { q: "Коя уеб технология се използва за описание и структуриране на съдържанието на уеб страницата?",
    a: ["CSS.", "JavaScript.", "HTML.", "SQL."], correct: 2 },
  { q: "Каква е основната функция на CSS?",
    a: ["Създава бази данни.",
        "Оформя визуалния дизайн на уеб страниците.",
        "Управлява хардуерните компоненти на компютъра.",
        "Съхранява файловете на уеб сайта."], correct: 1 },
  { q: "Каква е ролята на JavaScript в уеб програмирането?",
    a: ["Определя единствено структурата на HTML документа.",
        "Използва се само за създаване на изображения.",
        "Заменя необходимостта от уеб браузър.",
        "Добавя интерактивност и позволява динамична промяна на съдържанието."], correct: 3 },
  { q: "Кой HTML таг се използва за създаване на абзац?",
    a: ["<h1>", "<p>", "<img>", "<title>"], correct: 1 },
  { q: "Каква е разликата между атрибутите id и class?",
    a: ["id се използва само за изображения, а class – само за текст.",
        "Двата атрибута имат напълно еднакво предназначение.",
        "id идентифицира уникален елемент, а class може да се използва за групиране на няколко елемента.",
        "class задължително се поставя в затварящия таг."], correct: 2 },
  { q: "Какво съдържа елементът <body> в HTML документа?",
    a: ["Само информация за автора на страницата.",
        "Само настройките за кодировка.",
        "Единствено заглавието, което се показва в раздела на браузъра.",
        "Видимото съдържание на уеб страницата – текстове, изображения, връзки и други елементи."], correct: 3 }
];

const TIME_PER_QUESTION = 20; // секунди

// ============================================================
// СЪСТОЯНИЕ НА ИГРАТА
// ============================================================
let players = {};   // socketId -> { name, score, correctCount, answers: [] }
let gameState = {
  started: false,
  finished: false,
  currentQuestion: 0,
  questionStartTime: null,
  answeredThisRound: new Set(),
  log: []          // { playerName, questionIndex, answerIndex, correct, time }
};

// ============================================================
// SOCKET.IO ЛОГИКА
// ============================================================
io.on('connection', (socket) => {
  console.log('🔌 Свързан:', socket.id);

  // Изпращане на текущото състояние при свързване
  socket.emit('state', {
    started: gameState.started,
    finished: gameState.finished,
    currentQuestion: gameState.currentQuestion,
    players: Object.values(players)
  });

  // -------- РЕГИСТРАЦИЯ НА ИГРАЧ --------
  socket.on('register', (name) => {
    if (gameState.started) {
      socket.emit('error-msg', 'Играта вече е стартирала!');
      return;
    }
    const trimmed = String(name).trim().slice(0, 30);
    if (!trimmed) { socket.emit('error-msg', 'Моля, въведи име!'); return; }
    if (Object.values(players).some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      socket.emit('error-msg', 'Това име вече е заето!');
      return;
    }
    players[socket.id] = { name: trimmed, score: 0, correctCount: 0, answers: [] };
    io.emit('players-update', Object.values(players));
    socket.emit('registered', trimmed);
    console.log('👤 Регистриран:', trimmed);
  });

  // -------- СТАРТИРАНЕ (само учител) --------
  socket.on('start-game', () => {
    if (gameState.started) return;
    if (Object.keys(players).length === 0) {
      socket.emit('error-msg', 'Няма записани играчи!');
      return;
    }
    gameState.started = true;
    gameState.finished = false;
    gameState.currentQuestion = 0;
    gameState.log = [];
    Object.values(players).forEach(p => { p.score = 0; p.correctCount = 0; p.answers = []; });

    io.emit('game-started');
    sendQuestion();
  });

  // -------- ОТГОВОР ОТ ИГРАЧ --------
  socket.on('answer', ({ questionIndex, answerIndex, timeLeft }) => {
    const p = players[socket.id];
    if (!p) return;
    if (!gameState.started || gameState.finished) return;
    if (questionIndex !== gameState.currentQuestion) return;
    if (gameState.answeredThisRound.has(socket.id)) return;

    gameState.answeredThisRound.add(socket.id);
    const correct = QUESTIONS[questionIndex].correct === answerIndex;
    p.answers.push({ questionIndex, answerIndex, correct });
    if (correct) { p.score += 1; p.correctCount += 1; }

    gameState.log.push({
      playerName: p.name,
      questionIndex: questionIndex + 1,
      answerIndex,
      correct,
      timeLeft: timeLeft || 0
    });

    socket.emit('answer-feedback', { correct, correctIndex: QUESTIONS[questionIndex].correct });
    io.emit('players-update', Object.values(players));
    io.emit('log-update', gameState.log);

    // Ако всички са отговорили → следващ въпрос
    if (gameState.answeredThisRound.size >= Object.keys(players).length) {
      endQuestion();
    }
  });

  // -------- ПРЕСКАЧАНЕ (учител) --------
  socket.on('skip-question', () => {
    if (gameState.started && !gameState.finished) endQuestion();
  });

  // -------- НУЛИРАНЕ (учител) --------
  socket.on('reset-game', () => {
    players = {};
    gameState = {
      started: false, finished: false, currentQuestion: 0,
      questionStartTime: null, answeredThisRound: new Set(), log: []
    };
    io.emit('game-reset');
    io.emit('players-update', []);
    io.emit('log-update', []);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('players-update', Object.values(players));
    console.log('❌ Откачен:', socket.id);
  });
});

// ============================================================
// ИЗПРАЩАНЕ НА ВЪПРОС + ТАЙМЕР
// ============================================================
let currentTimer = null;

function sendQuestion() {
  const idx = gameState.currentQuestion;
  const q = QUESTIONS[idx];
  gameState.answeredThisRound = new Set();
  gameState.questionStartTime = Date.now();

  io.emit('question', {
    index: idx,
    total: QUESTIONS.length,
    text: q.q,
    answers: q.a,
    timeLimit: TIME_PER_QUESTION
  });

  // Таймер сървърно
  let time = TIME_PER_QUESTION;
  clearInterval(currentTimer);
  currentTimer = setInterval(() => {
    time--;
    io.emit('timer', time);
    if (time <= 0) {
      clearInterval(currentTimer);
      endQuestion();
    }
  }, 1000);
}

function endQuestion() {
  clearInterval(currentTimer);
  gameState.currentQuestion++;

  if (gameState.currentQuestion >= QUESTIONS.length) {
    finishGame();
  } else {
    // Малка пауза преди следващ въпрос
    setTimeout(() => sendQuestion(), 2500);
    io.emit('between-questions');
  }
}

function finishGame() {
  gameState.finished = true;
  gameState.started = false;
  const sorted = Object.values(players)
    .map(p => ({ name: p.name, score: p.score, correctCount: p.correctCount }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  io.emit('game-over', sorted);
  console.log('🏁 Играта приключи');
}

// ============================================================
// СТАРТИРАНЕ НА СЪРВЪРА
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сървърът работи на порт ${PORT}`);
});