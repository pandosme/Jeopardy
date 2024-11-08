const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const config = require('./config/config.json')[process.env.NODE_ENV || 'development'];
const { Quiz, Question } = require('./model/Question');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Constants
const gameMasterName = config.gamemaster;
const audioClips = config.audioClips;
const GAME_TIMERS = {
    QUESTION_SPLASH: config.timers.questionSplashSeconds || 15,
    PLAYER_ANSWER: config.timers.playerAnswerSeconds || 10
};

// Server setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ['websocket', 'polling'],
    allowUpgrades: true
});

// Game state
let currentQuiz = null;
let gameInProgress = false;
let currentQuestion = null;
let players = {};
let buzzedInPlayer = null;
let categories = [];
let questions = {};
let debugEnabled = false;
let scoringHistory = [];

// MongoDB connection
mongoose.connect(config.mongodb.uri)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
        console.error('Error connecting to MongoDB:', err);
        process.exit(1);
    });

// Express middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/upload', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'upload.html')); });

app.get('/api/quizzes', async (req, res) => {
    try {
        console.log('Fetching quizzes from database...');
        const quizzes = await Quiz.find({}, 'name description');
        console.log('Fetched quizzes:', quizzes);
        res.json(quizzes);
    } catch (error) {
        console.error('Error fetching quizzes:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/upload-game', async (req, res) => {
    try {
        const { csv: csvData, fileName } = req.body;
        if (!csvData || !fileName) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing CSV data or filename' 
            });
        }

        // Remove .csv extension for quiz name
        const quizName = fileName.replace('.csv', '');

        // First, find if quiz exists
        let quiz = await Quiz.findOne({ name: quizName });
        let isUpdate = false;

        if (quiz) {
            // If quiz exists, delete all its existing questions
            isUpdate = true;
            console.log(`Updating existing quiz: ${quizName}`);
            await Question.deleteMany({ quiz: quiz._id });
        } else {
            // Create new quiz if it doesn't exist
            quiz = new Quiz({
                name: quizName,
                description: `Uploaded on ${new Date().toLocaleDateString()}`
            });
            await quiz.save();
        }

        // Parse CSV and create questions
        const questions = [];
        const lines = csvData.split('\n').map(line => line.trim()).filter(line => line);
        const header = lines[0].split(',');

        // Validate header
        if (!header.includes('Category') || !header.includes('Value') || 
            !header.includes('Question') || !header.includes('Answer')) {
            if (isUpdate) {
                // If this was an update and failed, delete the quiz
                await Quiz.findByIdAndDelete(quiz._id);
            }
            return res.status(400).json({
                success: false,
                message: 'Invalid CSV format. Required columns: Category, Value, Question, Answer'
            });
        }

        // Process data rows
        const errors = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            const [category, value, question, answer] = line.split(',').map(field => field.trim());
            
            if (!category || !value || !question || !answer) {
                errors.push(`Line ${i + 1}: Missing required fields`);
                continue;
            }

            const valueNum = parseInt(value);
            if (isNaN(valueNum)) {
                errors.push(`Line ${i + 1}: Value must be a number`);
                continue;
            }

            questions.push({
                quiz: quiz._id,
                category,
                value: valueNum,
                question,
                answer
            });
        }

        if (errors.length > 0) {
            // Clean up if there were errors
            if (!isUpdate) {
                await Quiz.findByIdAndDelete(quiz._id);
            }
            return res.status(400).json({
                success: false,
                message: 'CSV validation failed',
                errors
            });
        }

        // Save all questions
        await Question.insertMany(questions);

        console.log(`${isUpdate ? 'Updated' : 'Uploaded'} quiz "${quizName}" with ${questions.length} questions`);
        res.json({ 
            success: true, 
            message: `Quiz ${isUpdate ? 'updated' : 'created'} successfully`,
            questionCount: questions.length 
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Game data loading function
async function loadGameData(quizId) {
    if (!quizId) {
        throw new Error('No quiz ID provided');
    }
    
    try {
        console.log('Loading quiz data for ID:', quizId);
        currentQuiz = await Quiz.findById(quizId);
        if (!currentQuiz) {
            throw new Error('Quiz not found');
        }
        
        const allQuestions = await Question.find({ quiz: quizId });
        if (allQuestions.length === 0) {
            throw new Error('No questions found for this quiz');
        }

        // If we already have questions loaded, preserve their answered state
        const existingAnsweredState = {};
        if (questions) {
            Object.keys(questions).forEach(category => {
                questions[category].forEach(q => {
                    if (q.answered) {
                        const key = `${category}-${q.value}`;
                        existingAnsweredState[key] = true;
                    }
                });
            });
        }
        
        categories = [...new Set(allQuestions.map(q => q.category))];
        questions = {};
        
        // Initialize questions with preserved answered state
        categories.forEach(category => {
            questions[category] = allQuestions
                .filter(q => q.category === category)
                .map(q => ({
                    ...q.toObject(),
                    answered: existingAnsweredState[`${category}-${q.value}`] || false
                }));
        });

        console.log('Questions state after loading:', 
            Object.keys(questions).map(cat => ({
                category: cat,
                answeredQuestions: questions[cat].filter(q => q.answered).length
            }))
        );
        
        return true;
    } catch (error) {
        console.error('Error loading game data:', error);
        throw error;
    }
}

// Helper functions
function getScores() {
    return Object.values(players).reduce((scores, player) => {
        scores[player.name] = player.score;
        return scores;
    }, {});
}

function resetGame() {
    currentQuiz = null;
    gameInProgress = false;
    currentQuestion = null;
    buzzedInPlayer = null;
    categories = [];
    questions = {};
}

function validateQuestion(data) {
    return data && 
           typeof data.category === 'string' && 
           typeof data.value === 'number' &&
           questions[data.category];
}

function broadcastPlayers() {
    io.emit('playersUpdate', Object.values(players).map(p => ({
        name: p.name
    })));
}

function broadcastPlayerList() {
    const playerList = Object.values(players).map(p => ({
        name: p.name,
        socketId: p.socketId
    }));
    console.log('Broadcasting player list:', playerList);
    io.emit('playerListUpdate', playerList);
}

function areAllQuestionsAnswered() {
  return Object.values(questions).every(categoryQuestions => 
    categoryQuestions.every(question => question.answered)
  );
}

function getFinalScores() {
  return Object.entries(players)
    .map(([id, player]) => ({ name: player.name, score: player.score }))
    .sort((a, b) => b.score - a.score);
}

function resetGame() {
  currentQuiz = null;
  gameInProgress = false;
  currentQuestion = null;
  buzzedInPlayer = null;
  categories = [];
  questions = {};
  // Reset player scores
  Object.values(players).forEach(player => {
    player.score = 0;
  });
}

function findLastScoringEvent(playerId) {
  // This is a placeholder function. You'll need to implement the logic to find the last scoring event.
  // This might involve keeping a log of scoring events or using your existing game state.
  // For now, let's return a dummy event:
  return {
    playerId: playerId,
    scoreChange: 100 // Assume the last change was +100 points
  };
}

// Socket.IO event handlers
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('keepalive', () => {
        socket.emit('keepalive');
    });

    socket.emit('audioClipPaths', audioClips);
	
	socket.on('registerUser', (userName) => {
		console.log('User registration attempt:', userName);
		if (userName === config.gamemaster) {
			socket.emit('userRegistered', { role: 'gamemaster' });
		} else if (userName === 'board') {
			socket.emit('userRegistered', { role: 'board', gameInProgress });
		} else {
			const existingPlayer = Object.values(players).find(p => p.name === userName);
			if (existingPlayer) {
				existingPlayer.socketId = socket.id;
				socket.emit('userRegistered', {
					role: 'player',
					name: userName,
					score: existingPlayer.score
				});
			} else {
				players[socket.id] = {
					name: userName,
					score: 0,
					socketId: socket.id
				};
				socket.emit('userRegistered', {
					role: 'player',
					name: userName,
					score: 0
				});
			}
			// Broadcast updated player list to all clients
			const playerList = Object.values(players).map(p => ({
				name: p.name,
				socketId: p.socketId
			}));
			io.emit('playerListUpdate', playerList);
		}
	});

	socket.on('newGame', () => {
	  console.log('New game requested by gamemaster');
	  // Reset game state
	  resetGame();
	  // Notify all clients that a new game is starting
	  io.emit('newGameStarted');
	});

	socket.on('checkGameState', () => {
		socket.emit('gameState', {
			gameInProgress,
			currentGame: currentQuiz ? {
				name: currentQuiz.name,
				id: currentQuiz._id
			} : null
		});
	});

	socket.on('requestGameData', async () => {
		console.log('Game data requested');
		if (gameInProgress && currentQuiz) {
			if (!questions || Object.keys(questions).length === 0) {
				try {
					await loadGameData(currentQuiz._id);
				} catch (error) {
					console.error('Error loading game data:', error);
					socket.emit('gameError', { message: 'Failed to load game data' });
					return;
				}
			}
			
			socket.emit('gameData', {
				categories,
				questions,
				currentGame: {
					name: currentQuiz.name,
					id: currentQuiz._id
				}
			});

			// Send game name for connection status
			socket.emit('updateConnectionStatus', {
				status: 'connected',
				gameName: currentQuiz.name
			});
		}
	});

	socket.on('requestPlayerList', () => {
		console.log('Player list requested');
		const playerList = Object.values(players).map(p => ({
			name: p.name,
			socketId: p.socketId
		}));
		console.log('Sending player list:', playerList);
		io.emit('playerListUpdate', playerList);
	});

	socket.on('startGame', async (quizId) => {
		console.log('Starting game with quiz:', quizId);
		if (!gameInProgress) {
			try {
				await loadGameData(quizId);
				gameInProgress = true;
				io.emit('gameStarted', { 
					quizName: currentQuiz.name 
				});
				// Send updated connection status to all clients
				io.emit('updateConnectionStatus', {
					status: 'connected',
					gameName: currentQuiz.name
				});
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
		if (!validateQuestion(data)) {
			return socket.emit('gameError', { message: 'Invalid question selection data' });
		}

		const categoryQuestions = questions[data.category];
		currentQuestion = categoryQuestions.find(q => q.value === parseInt(data.value));
		
		if (!currentQuestion) {
			return socket.emit('gameError', { message: 'Invalid question selected' });
		}

		// Reset buzzed player
		buzzedInPlayer = null;

		// First emit question selected
		io.emit('questionSelected', {
			category: data.category,
			value: data.value,
			question: currentQuestion.question,
			answer: currentQuestion.answer,
			timeLimit: config.timers.questionSplashSeconds
		});

		// Then explicitly enable buzzers
		console.log('Enabling buzzers for all players');
		io.emit('enableBuzzers');
	});

	socket.on('playerBuzzIn', (data) => {
		console.log('Player buzzed in:', data.playerName);
		if (gameInProgress && currentQuestion && !buzzedInPlayer &&
			players[socket.id] && players[socket.id].name === data.playerName) {
			
			buzzedInPlayer = socket.id;
			if (!currentQuestion.attemptedPlayers) {
				currentQuestion.attemptedPlayers = [];
			}
			currentQuestion.attemptedPlayers.push(socket.id);
			
			// Cancel any pending question display and notify all clients
			io.emit('cancelQuestionDisplay');
			io.emit('playerBuzzed', {
				playerName: data.playerName,
				playerId: socket.id,
				timeLimit: GAME_TIMERS.PLAYER_ANSWER
			});
		}
	});

	socket.on('answerResult', (result) => {
		if (buzzedInPlayer && currentQuestion) {
			const player = players[buzzedInPlayer];
			if (result.correct) {
				player.score += currentQuestion.value;
				if (currentQuestion) {
					currentQuestion.answered = true;
				}
				io.emit('correctAnswer', {
					playerName: player.name,
					newScore: player.score,
					category: currentQuestion.category,
					value: currentQuestion.value
				});
				currentQuestion = null;
				buzzedInPlayer = null;
				io.emit('disableBuzzers');
			} else {
				player.score -= currentQuestion.value;
				io.emit('wrongAnswer', {
					playerName: player.name,
					newScore: player.score,
					playerId: buzzedInPlayer
				});
				
				// Show question again with reduced time
				const reducedTime = Math.floor(config.timers.questionSplashSeconds / 3);
				console.log('Showing question splash with reduced time:', reducedTime);
				io.emit('showQuestionSplash', {
					question: currentQuestion.question,
					timeLimit: reducedTime
				});
				
				// Enable buzzers for all players except the one who just answered
				const activePlayers = Object.keys(players).filter(id => id !== buzzedInPlayer);
				buzzedInPlayer = null;
				io.emit('enableBuzzersForPlayers', { activePlayers });
			}
			io.emit('updateScores', getScores());
		}
	});

	socket.on('questionAnswered', (data) => {
		if (currentQuestion) {
			// Mark the question as answered in the questions object
			const categoryQuestions = questions[currentQuestion.category];
			const question = categoryQuestions.find(q => q.value === currentQuestion.value);
			if (question) {
				question.answered = true;
				console.log(`Marked question as answered: ${currentQuestion.category} - $${currentQuestion.value}`);
			}
			
			io.emit('questionAnswered', {
				category: currentQuestion.category,
				value: currentQuestion.value
			});
			currentQuestion = null;
			buzzedInPlayer = null;
			io.emit('hideQuestionSplash');
		}
		if (areAllQuestionsAnswered()) {
		  const finalScores = getFinalScores();
		  io.emit('gameOver', { finalScores });
		}
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
        }
    });


	socket.on('timerExpired', (data) => {
	  if (data.type === 'questionSplash') {
		if (currentQuestion) {
		  // Mark the question as answered in the questions object
		  const categoryQuestions = questions[currentQuestion.category];
		  const question = categoryQuestions.find(q => q.value === currentQuestion.value);
		  if (question) {
			question.answered = true;
			console.log(`Marked question as answered (timeout): ${currentQuestion.category} - $${currentQuestion.value}`);
		  }
		  
		  // Notify all clients that question is answered
		  io.emit('questionAnswered', { category: currentQuestion.category, value: currentQuestion.value });
		  
		  currentQuestion = null;
		  buzzedInPlayer = null;
		  io.emit('hideQuestionSplash');
		  io.emit('disableBuzzers');
		}
	  } else if (data.type === 'playerAnswer' && buzzedInPlayer) {
		const player = players[buzzedInPlayer];
		player.score -= currentQuestion.value;

		// Mark the question as answered
		const categoryQuestions = questions[currentQuestion.category];
		const question = categoryQuestions.find(q => q.value === currentQuestion.value);
		if (question) {
		  question.answered = true;
		  console.log(`Marked question as answered (answer timeout): ${currentQuestion.category} - $${currentQuestion.value}`);
		}

		io.emit('wrongAnswer', { playerName: player.name, newScore: player.score, playerId: buzzedInPlayer });
		io.emit('questionAnswered', { category: currentQuestion.category, value: currentQuestion.value });

		// Clear game state
		buzzedInPlayer = null;
		io.emit('hideQuestionSplash');
		io.emit('updateScores', getScores());
	  }
	});

	socket.on('disconnect', (reason) => {
		console.log(`Client disconnected: ${socket.id}, Reason: ${reason}`);
		if (players[socket.id]) {
			delete players[socket.id];
			console.log('Player disconnected, remaining players:', players);
			broadcastPlayerList();
		}
	});

	socket.on('leaveGame', (data) => {
		console.log('Player/Gamemaster leaving game:', data.userName);
		
		if (data.userName === config.gamemaster) {
			// Handle gamemaster leaving
			console.log('Gamemaster left the game');
			// Reset game state
			currentQuiz = null;
			gameInProgress = false;
			currentQuestion = null;
			buzzedInPlayer = null;
			categories = [];
			questions = {};
			
			// Notify all clients that the game has ended
			io.emit('gameEnded', { reason: 'Gamemaster left the game' });
			io.emit('updateConnectionStatus', {
				status: 'connected',
				gameName: null
			});
		} else if (players[socket.id]) {
			// Remove player from game
			console.log(`Removing player: ${players[socket.id].name}`);
			delete players[socket.id];
			
			// If this was the buzzed in player, reset state
			if (buzzedInPlayer === socket.id) {
				buzzedInPlayer = null;
				if (currentQuestion) {
					// Show question again with reduced time
					io.emit('showQuestionSplash', {
						question: currentQuestion.question,
						timeLimit: Math.floor(config.timers.questionSplashSeconds / 3)
					});
					
					// Enable buzzers for remaining players
					const activePlayers = Object.keys(players);
					io.emit('enableBuzzersForPlayers', { activePlayers });
				}
			}
			
			// Broadcast updated player list
			broadcastPlayerList();
			io.emit('updateScores', getScores());
		}
	});


	socket.on('debug', (data) => {
		if (debugEnabled) {
			const clientInfo = `[${socket.id}${data.userName ? '/' + data.userName : ''}${data.userRole ? '/' + data.userRole : ''}]`;
			console.log(`DEBUG ${clientInfo}:`, data.message);
			if (data.data) {
				console.log('Debug data:', data.data);
			}
		}
	});

	socket.on('adjustPlayerScore', (data) => {
	  const { playerId, scoreChange } = data;
	  
	  if (players[playerId]) {
		const player = players[playerId];
		player.score += scoreChange;
		
		console.log(`Score adjusted for ${player.name}. Change: $${scoreChange}. New score: $${player.score}`);
		
		// Broadcast updated scores to all clients
		io.emit('updateScores', getScores());
	  }
	});

});

// Start the server
const PORT = config.port;
server.listen(PORT,'0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
    console.error('Error starting server:', err);
    process.exit(1);
});
