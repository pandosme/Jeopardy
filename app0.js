const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const config = require('./config/config.json')[process.env.NODE_ENV || 'development'];
const { Quiz, Question } = require('./model/Question');
const csv = require('csv-parser');
const { Readable } = require('stream');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

mongoose.connect(config.mongodb.uri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));
app.get('/gameboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gameboard.html')));
app.get('/player', (req, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));
app.get('/gamemaster', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gamemaster.html')));
app.get('/upload', (req, res) => res.sendFile(path.join(__dirname, 'public', 'upload.html')));
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));

app.get('/api/quizzes', async (req, res) => {
  try {
    const quizzes = await Quiz.find({}, 'name description');
    res.json(quizzes);
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/upload-game', express.json({ limit: '1mb' }), async (req, res) => {
  const { csv: csvData, fileName } = req.body;
  const gameName = path.parse(fileName).name;
  const results = [];
  const errors = [];
  let lineNumber = 1;
  const stream = Readable.from(csvData);

  stream
    .pipe(csv({
      mapValues: ({ header, index, value }) => {
        if (header === 'Value') {
          const parsedValue = parseInt(value);
          if (isNaN(parsedValue)) {
            errors.push(`Line ${lineNumber}: Invalid value in 'Value' column: "${value}". Must be a number.`);
          }
          return parsedValue;
        }
        return value;
      }
    }))
    .on('data', (data) => {
      lineNumber++;
      if (!data.Category || !data.Value || !data.Question || !data.Answer) {
        const missingColumns = ['Category', 'Value', 'Question', 'Answer']
          .filter(col => !data[col])
          .join(', ');
        errors.push(`Line ${lineNumber}: Missing data in column(s): ${missingColumns}`);
      }
      results.push(data);
    })
    .on('end', async () => {
      if (errors.length > 0) {
        return res.json({
          success: false,
          message: 'CSV file contains errors:',
          errors: errors
        });
      }

      if (results.length !== 25) {
        return res.json({
          success: false,
          message: `CSV must contain exactly 25 questions. Found ${results.length} questions.`
        });
      }

      try {
        const quiz = new Quiz({ name: gameName });
        await quiz.save();
        const questions = results.map(row => ({
          quiz: quiz._id,
          category: row.Category,
          value: row.Value,
          question: row.Question,
          answer: row.Answer
        }));
        await Question.insertMany(questions);
        res.json({ success: true, message: 'Game uploaded successfully.' });
      } catch (error) {
        console.error('Error saving game:', error);
        res.json({
          success: false,
          message: 'Error saving game to database.',
          error: error.message
        });
      }
    });
});

let currentQuiz = null;
let gameInProgress = false;
let currentQuestion = null;
let players = {};
let buzzedInPlayer = null;
let categories = [];
let questions = {};
let gameMasterName = "magnus";
let gameMasterSocketId = null;

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('playerRegister', (playerName) => {
    console.log('Player registration attempt:', playerName);
    const existingPlayer = Object.values(players).find(p => p.name === playerName);
    if (existingPlayer) {
      if (existingPlayer.socketId !== socket.id) {
        socket.emit('registrationFailed', { message: 'Name already taken' });
      } else {
        socket.emit('registrationSuccess', { name: playerName, score: existingPlayer.score, isGameMaster: playerName === gameMasterName });
      }
    } else {
      players[socket.id] = { name: playerName, score: 0, socketId: socket.id };
      socket.emit('registrationSuccess', { name: playerName, score: 0, isGameMaster: playerName === gameMasterName });
      if (playerName === gameMasterName) {
        gameMasterSocketId = socket.id;
      }
    }
    io.emit('updateScores', getScores());
  });

  socket.on('checkGameStatus', () => {
    socket.emit('gameStatus', { gameInProgress: gameInProgress, currentGame: currentQuiz });
  });

  socket.on('requestGameData', async () => {
    if (categories.length === 0 && currentQuiz) {
      try {
        await loadGameData(currentQuiz._id);
      } catch (error) {
        console.error('Error loading game data:', error);
        socket.emit('gameError', { message: 'Failed to load game data' });
        return;
      }
    }
    socket.emit('gameData', { categories, questions });
  });

  socket.on('startGame', async (quizId) => {
    console.log('Starting game with quiz:', quizId);
    if (!gameInProgress) {
      try {
        await loadGameData(quizId);
        gameInProgress = true;
        io.emit('gameStarted', { quizName: currentQuiz.name });
      } catch (error) {
        console.error('Error starting game:', error);
        socket.emit('gameError', { message: 'Failed to start game: ' + error.message });
      }
    } else {
      socket.emit('gameError', { message: 'A game is already in progress' });
    }
  });

  socket.on('selectQuestion', (data) => {
    console.log('Question selected:', data);
    const categoryQuestions = questions[data.category];
    if (!categoryQuestions) {
      console.error('Category not found:', data.category);
      socket.emit('gameError', { message: 'Invalid category selected' });
      return;
    }

    currentQuestion = categoryQuestions.find(q => q.value === parseInt(data.value));
    if (!currentQuestion) {
      console.error('Question not found:', data);
      socket.emit('gameError', { message: 'Invalid question selected' });
      return;
    }

    buzzedInPlayer = null;
    if (gameMasterSocketId) {
      io.to(gameMasterSocketId).emit('questionSelected', {
        category: data.category,
        value: data.value,
        question: currentQuestion.question,
        answer: currentQuestion.answer
      });
    }
    io.emit('enableBuzzers');
  });

  socket.on('playerBuzzIn', () => {
    console.log('Player buzzed in:', players[socket.id]?.name);
    if (gameInProgress && currentQuestion && !buzzedInPlayer && players[socket.id]) {
      buzzedInPlayer = socket.id;
      io.emit('playerBuzzed', {
        playerName: players[socket.id].name,
        playerId: socket.id
      });
    }
  });

  socket.on('answerResult', (result) => {
    console.log('Answer result:', result);
    if (buzzedInPlayer && currentQuestion) {
      const player = players[buzzedInPlayer];
      if (result.correct) {
        player.score += currentQuestion.value;
        io.emit('correctAnswer', {
          playerName: player.name,
          newScore: player.score,
          category: currentQuestion.category,
          value: currentQuestion.value
        });
        currentQuestion = null;
        buzzedInPlayer = null;
      } else {
        player.score -= currentQuestion.value;
        io.emit('wrongAnswer', {
          playerName: player.name,
          newScore: player.score,
          playerId: buzzedInPlayer
        });
        buzzedInPlayer = null;
      }
      io.emit('updateScores', getScores());
    }
  });

  socket.on('enableBuzzers', () => {
    io.emit('enableBuzzers');
  });

  socket.on('nextQuestion', () => {
    console.log('Moving to next question');
    if (currentQuestion) {
      io.emit('questionAnswered', {
        category: currentQuestion.category,
        value: currentQuestion.value
      });
      currentQuestion = null;
      buzzedInPlayer = null;
      io.emit('disableBuzzers');
      io.emit('hideQuestionSplash');
    }
  });

  socket.on('checkPlayerStatus', (playerName) => {
    const existingPlayer = Object.values(players).find(p => p.name === playerName);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      socket.emit('playerStatus', {
        registered: true,
        name: existingPlayer.name,
        score: existingPlayer.score
      });
    } else {
      socket.emit('playerStatus', { registered: false });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (players[socket.id]) {
      players[socket.id].active = false;
      io.emit('updateScores', getScores());
    }
  });
});

async function loadGameData(quizId) {
  if (!quizId) {
    throw new Error('No quiz ID provided');
  }
  try {
    currentQuiz = await Quiz.findById(quizId);
    if (!currentQuiz) {
      throw new Error('Quiz not found');
    }
    const allQuestions = await Question.find({ quiz: quizId });
    if (allQuestions.length === 0) {
      throw new Error('No questions found for this quiz');
    }
    categories = [...new Set(allQuestions.map(q => q.category))];
    questions = {};
    categories.forEach(category => {
      questions[category] = allQuestions.filter(q => q.category === category);
    });
    console.log(`Loaded quiz: ${currentQuiz.name} with ${allQuestions.length} questions`);
  } catch (error) {
    console.error('Error loading game data:', error);
    throw error;
  }
}

function getScores() {
  return Object.values(players).reduce((scores, player) => {
    if (player.active !== false) {
      scores[player.name] = player.score;
    }
    return scores;
  }, {});
}

const PORT = config.port;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
