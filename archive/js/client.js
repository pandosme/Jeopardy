const socket = io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
});

// Debug function
function debug(message, data = null) {
    socket.emit('debug', {
        message,
        data,
        userName,
        userRole
    });
}

// DOM Elements
const views = {
    registration: document.getElementById('registration-view'),
    player: document.getElementById('player-view'),
    gameboard: document.getElementById('gameboard-view'),
    gamemaster: document.getElementById('gamemaster-view'),
    selectGame: document.getElementById('select-game-view')
};

// Game state variables
let userName = localStorage.getItem('userName');
let userRole = null;
let canBuzzIn = false;
let categories = [];
let questions = {};
let questionTimer;
let answerTimer;
let questionDisplayTimeout;
let currentPlayers = {};

// Game master control elements
const correctButton = document.getElementById('correct-button');
const incorrectButton = document.getElementById('incorrect-button');
const nextButton = document.getElementById('next-button');
const buzzerButton = document.getElementById('buzzer');

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    if (userName) {
        socket.emit('registerUser', userName);
        socket.emit('checkGameState');
    } else {
        showView('registration');
        updateConnectionStatus('connected', 'Connected to server');
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateConnectionStatus('disconnected', 'Disconnected from server. Attempting to reconnect...');
});

socket.on('userRegistered', (data) => {
    userRole = data.role;
    if (data.role === 'gamemaster') {
        showView('gamemaster');
        socket.emit('requestPlayerList');
        setupLeaveButton(); // Add this
        setupGameMasterButtons(); // Add this function call		
    }

    if (data.role === 'board') {
        if (data.gameInProgress) {
            showView('gameboard');
            socket.emit('requestGameData');
        } else {
            showView('selectGame');
            fetchGames();
        }
        socket.emit('requestPlayerList');
    }

    if (data.role === 'player') {
        showView('player');
        document.getElementById('player-name').textContent = data.name;
        document.getElementById('player-score').textContent = data.score;
        setupLeaveButton(); // Add this
    }
});

socket.on('playerListUpdate', (playerList) => {
    debug('Received player list update', playerList);
    if (userRole === 'gamemaster' || userRole === 'board') {
        const playersList = document.getElementById('players-list');
        if (playersList) {
            playersList.innerHTML = '';
            playerList.forEach(player => {
                const playerItem = document.createElement('div');
                playerItem.className = 'player-item';
                playerItem.textContent = player.name;
                playersList.appendChild(playerItem);
            });
        }
    }
});

socket.on('gameData', (data) => {
    debug('Received game data', data);
    categories = data.categories;
    questions = data.questions;
    if (data.currentGame) {
        updateConnectionStatus('connected', data.currentGame.name);
    }
    renderGameBoard();
});

socket.on('gameState', (state) => {
    if (state.gameInProgress && state.currentGame) {
        updateConnectionStatus('connected', state.currentGame.name);
        if (userRole === 'board') {
            showView('gameboard');
        }
    } else {
        if (userRole === 'board') {
            showView('selectGame');
            updateConnectionStatus('waiting', 'Waiting for a game...');
        } else {
            updateConnectionStatus('connected', 'Connected to server');
        }
    }
});

socket.on('gameStarted', (data) => {
    if (userRole === 'board') {
        showView('gameboard');
    }
    updateConnectionStatus('connected', data.quizName);
});

socket.on('questionSelected', (data) => {
    debug('Received questionSelected event', data);
    
    if (userRole === 'board') {
        highlightSelectedQuestion(data.category, data.value);
        questionDisplayTimeout = setTimeout(() => {
            startQuestionSplash(data.question, data.timeLimit);
        }, 4000);
    }

    if (userRole === 'player') {
        const currentQuestionElement = document.getElementById('current-question');
        if (currentQuestionElement) {
            currentQuestionElement.textContent = `${data.category} for $${data.value}`;
        }
        // Don't enable buzzer here, wait for enableBuzzers event
    }

    if (userRole === 'gamemaster') {
        const gmQuestion = document.getElementById('gm-question');
        const gmAnswer = document.getElementById('gm-answer');
        if (gmQuestion && gmAnswer) {
            gmQuestion.textContent = data.question;
            gmAnswer.textContent = data.answer;
        }
    }
});

socket.on('playerBuzzed', (data) => {
    debug('Player buzzed in', data);
    
    if (userRole === 'board') {
        if (questionDisplayTimeout) {
            clearTimeout(questionDisplayTimeout);
            questionDisplayTimeout = null;
        }
        hideQuestionSplash();
        showPlayerAnswering(data.playerName, data.timeLimit);
    }

    if (userRole === 'player') {
        const buzzerButton = document.getElementById('buzzer');
        if (buzzerButton) {  // Add null check
            if (data.playerId === socket.id) {
                // This player was first to buzz in
                debug('This player was first to buzz in');
                buzzerButton.disabled = true;  // Disable the button
                buzzerButton.style.backgroundColor = '#28a745'; // Green
                buzzerButton.classList.add('correct');
            } else {
                // Another player was faster
                debug('Another player was faster');
                disableBuzzer();
            }
        }
    }

    if (userRole === 'gamemaster') {
        document.getElementById('buzzed-player').textContent = data.playerName;
    }
});

socket.on('questionAnswered', (data) => {
    if (userRole === 'board') {
        hideQuestionSplash();
        markQuestionAsAnswered(data.category, data.value);
    }
    if (userRole === 'player') {
        disableBuzzer();
    }
});

socket.on('correctAnswer', (data) => {
    if (userRole === 'board') {
        markQuestionAsAnswered(data.category, data.value);
        hideQuestionSplash();
    }

    if (userRole === 'player') {
        if (userName === data.playerName) {
            document.getElementById('player-score').textContent = data.newScore;
        }
        disableBuzzer();
    }

    if (userRole === 'gamemaster') {
        document.getElementById('gm-question').textContent = '';
        document.getElementById('gm-answer').textContent = '';
        document.getElementById('buzzed-player').textContent = '';
    }
});

socket.on('showQuestionSplash', (data) => {
    debug('Received showQuestionSplash event', data);
    if (userRole === 'board') {
        // Clear any existing timers and show new question splash
        if (questionTimer) clearInterval(questionTimer);
        if (answerTimer) clearInterval(answerTimer);
        if (questionDisplayTimeout) clearTimeout(questionDisplayTimeout);
        
        startQuestionSplash(data.question, data.timeLimit);
    }
});

socket.on('wrongAnswer', (data) => {
    debug('Received wrong answer', data);
    if (userRole === 'board') {
        // Only clear the answer splash, wait for showQuestionSplash event
        if (answerTimer) clearInterval(answerTimer);
    }
    
    if (userRole === 'player' && userName === data.playerName) {
        document.getElementById('player-score').textContent = data.newScore;
    }
});

socket.on('enableBuzzers', () => {
    debug('Received enableBuzzers event');
    if (userRole === 'player') {
        debug('Enabling buzzer for player');
        enableBuzzer();
    }
});

socket.on('enableBuzzersForPlayers', (data) => {
    debug('Received enableBuzzersForPlayers event', data);
    if (userRole === 'player' && data.activePlayers.includes(socket.id)) {
        enableBuzzer();
    }
});

socket.on('updateScores', (scores) => {
    if (userRole === 'gamemaster') {
        const playersScores = document.getElementById('players-scores');
        if (playersScores) {
            playersScores.innerHTML = '';
            Object.entries(scores)
                .sort((a, b) => b[1] - a[1]) // Sort by score descending
                .forEach(([name, score]) => {
                    const scoreItem = document.createElement('div');
                    scoreItem.className = 'player-score-item';
                    scoreItem.innerHTML = `
                        <span>${name}</span>
                        <span>$${score}</span>
                    `;
                    playersScores.appendChild(scoreItem);
                });
        }
    }
});

socket.on('gameEnded', (data) => {
    debug('Game ended', data);
    if (userRole === 'player' || userRole === 'gamemaster') {
        // Clear local storage and reset state
        localStorage.removeItem('userName');
        userName = null;
        userRole = null;
        canBuzzIn = false;
        
        // Show registration view
        showView('registration');
        updateConnectionStatus('connected', 'Connected to server');
    }
    
    if (userRole === 'board') {
        showView('selectGame');
        updateConnectionStatus('waiting', 'Waiting for a game...');
    }
});

// Helper Functions
function showView(viewName) {
    Object.values(views).forEach(view => view.style.display = 'none');
    views[viewName].style.display = 'block';
}

function updateConnectionStatus(status, message) {
    const connectionStatus = document.getElementById('connection-status');
    connectionStatus.textContent = message;
    connectionStatus.className = status;
}

function enableBuzzer() {
    const buzzerButton = document.getElementById('buzzer');
    debug('enableBuzzer called', { buzzerExists: !!buzzerButton });
    if (buzzerButton) {
        buzzerButton.disabled = false;
        buzzerButton.style.backgroundColor = '#dc3545'; // Red
        buzzerButton.classList.remove('correct');
        canBuzzIn = true;
        debug('Buzzer enabled successfully');
    } else {
        debug('Buzzer button not found in DOM');
    }
}

function disableBuzzer() {
    const buzzerButton = document.getElementById('buzzer');
    debug('disableBuzzer called', { buzzerExists: !!buzzerButton });
    if (buzzerButton) {
        buzzerButton.disabled = true;
        buzzerButton.style.backgroundColor = '#cccccc'; // Gray
        buzzerButton.classList.remove('correct');
        canBuzzIn = false;
        debug('Buzzer disabled');
    }
}

function fetchGames() {
    console.log('Fetching games...');
    fetch('/api/quizzes')
        .then(response => response.json())
        .then(games => {
            console.log('Fetched games:', games);
            const gamesGrid = document.getElementById('games-grid');
            gamesGrid.innerHTML = '';
            games.forEach(game => {
                const gameBox = document.createElement('div');
                gameBox.className = 'game-box';
                gameBox.textContent = game.name;
                gameBox.addEventListener('click', () => {
                    socket.emit('startGame', game._id);
                });
                gamesGrid.appendChild(gameBox);
            });
        })
        .catch(error => {
            console.error('Error fetching games:', error);
        });
}

function renderGameBoard() {
    const gameBoard = document.getElementById('game-board');
    gameBoard.innerHTML = '';
    
    debug('Rendering board', { categories, questions });
    
    // Render categories
    categories.forEach(category => {
        const categoryElement = document.createElement('div');
        categoryElement.className = 'category';
        categoryElement.textContent = category;
        gameBoard.appendChild(categoryElement);
    });

    // Render questions
    const values = [100, 200, 300, 400, 500];
    values.forEach(value => {
        categories.forEach(category => {
            const questionElement = document.createElement('div');
            questionElement.className = 'question-value';
            questionElement.dataset.category = category;
            questionElement.dataset.value = value;
            
            // Check if question has been answered
            const categoryQuestions = questions[category];
            if (categoryQuestions) {
                const question = categoryQuestions.find(q => q.value === value);
                debug('Question state', { category, value, question });
                
                if (question && question.answered) {
                    questionElement.classList.add('answered');
                    questionElement.textContent = '';
                } else {
                    questionElement.textContent = `$${value}`;
                }
            } else {
                questionElement.textContent = `$${value}`;
            }
            
            gameBoard.appendChild(questionElement);
        });
    });
}

function startQuestionSplash(question, timeLimit) {
    debug('Starting question splash', { question, timeLimit });
    const questionSplash = document.getElementById('question-splash');
    const questionText = document.getElementById('question-text');
    const timerElement = document.getElementById('timer-countdown');
    
    // Clear any existing timers
    if (questionTimer) clearInterval(questionTimer);
    if (answerTimer) clearInterval(answerTimer);
    if (questionDisplayTimeout) clearTimeout(questionDisplayTimeout);
    
    questionText.textContent = question;
    questionSplash.classList.remove('hidden');
    
    let timeLeft = parseInt(timeLimit) || 30;
    timerElement.textContent = timeLeft;
    
    questionTimer = setInterval(() => {
        timeLeft--;
        timerElement.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(questionTimer);
            socket.emit('timerExpired', { type: 'questionSplash' });
            hideQuestionSplash();
        }
    }, 1000);
}

function hideQuestionSplash() {
    const questionSplash = document.getElementById('question-splash');
    const timerElement = document.getElementById('timer-countdown');
    
    if (questionTimer) clearInterval(questionTimer);
    if (answerTimer) clearInterval(answerTimer);
    if (questionDisplayTimeout) clearTimeout(questionDisplayTimeout);
    
    questionSplash.classList.add('hidden');
    timerElement.textContent = '';
}

function showPlayerAnswering(playerName, timeLimit) {
    const questionSplash = document.getElementById('question-splash');
    const questionText = document.getElementById('question-text');
    const timerElement = document.getElementById('timer-countdown');
    
    // Clear any existing timers
    if (questionTimer) clearInterval(questionTimer);
    if (answerTimer) clearInterval(answerTimer);
    
    questionText.textContent = `${playerName} is answering...`;
    questionSplash.classList.remove('hidden');
    
    let timeLeft = timeLimit;
    timerElement.textContent = timeLeft;
    
    answerTimer = setInterval(() => {
        timeLeft--;
        timerElement.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(answerTimer);
            socket.emit('timerExpired', { type: 'playerAnswer' });
        }
    }, 1000);
}

function highlightSelectedQuestion(category, value) {
    const allQuestions = document.querySelectorAll('.question-value');
    allQuestions.forEach(q => q.classList.remove('selected'));
    
    const questionElement = document.querySelector(`[data-category="${category}"][data-value="${value}"]`);
    if (questionElement) {
        questionElement.classList.add('selected');
    }
}

function markQuestionAsAnswered(category, value) {
    const questionElement = document.querySelector(`[data-category="${category}"][data-value="${value}"]`);
    if (questionElement) {
        questionElement.classList.remove('selected');
        questionElement.classList.add('answered');
        questionElement.textContent = '';
        
        // Update local state
        if (questions[category]) {
            const question = questions[category].find(q => q.value === parseInt(value));
            if (question) {
                question.answered = true;
                debug('Marked question as answered', { category, value });
            }
        }
    }
}

function setupGameMasterButtons() {
    const correctButton = document.getElementById('correct-button');
    const incorrectButton = document.getElementById('incorrect-button');

    if (correctButton) {
        correctButton.addEventListener('click', () => {
            debug('Correct button clicked');
            socket.emit('answerResult', { correct: true });
            // Clear gamemaster view after correct answer
            document.getElementById('gm-question').textContent = '';
            document.getElementById('gm-answer').textContent = '';
            document.getElementById('buzzed-player').textContent = '';
        });
    }

    if (incorrectButton) {
        incorrectButton.addEventListener('click', () => {
            debug('Wrong button clicked');
            socket.emit('answerResult', { correct: false });
            // Keep the question and answer visible for next player
            document.getElementById('buzzed-player').textContent = '';
        });
    }
}

function setupLeaveButton() {
    const leaveButton = document.createElement('button');
    leaveButton.id = 'leave-game-button';
    leaveButton.className = 'leave-button';
    leaveButton.textContent = 'Leave Game';
    
    leaveButton.addEventListener('click', () => {
        const confirmMessage = userRole === 'gamemaster' 
            ? 'Are you sure you want to leave? This will end the game for all players!'
            : 'Are you sure you want to leave the game?';
            
        if (confirm(confirmMessage)) {
            debug('User confirmed leaving game', { userRole, userName });
            // Notify server
            socket.emit('leaveGame', { userName });
            
            // Clear local storage and reset state
            localStorage.removeItem('userName');
            userName = null;
            userRole = null;
            canBuzzIn = false;
            
            // Show registration view
            showView('registration');
            updateConnectionStatus('connected', 'Connected to server');
        }
    });

    // Add button to the appropriate view
    if (userRole === 'gamemaster') {
        views.gamemaster.appendChild(leaveButton);
    } else if (userRole === 'player') {
        views.player.appendChild(leaveButton);
    }
}


// Event Listeners
document.getElementById('registration-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('name-input');
    const name = nameInput.value.trim();
    
    const nameRegex = /^[a-zA-ZåäöÅÄÖ0-9 -]{2,20}$/;
    if (nameRegex.test(name)) {
        userName = name;
        localStorage.setItem('userName', userName);
        socket.emit('registerUser', userName);
    } else {
        alert('Please enter a valid name (2-20 characters, letters including åäö, numbers, spaces, or hyphens)');
    }
});

document.getElementById('game-board').addEventListener('click', (event) => {
    if (event.target.classList.contains('question-value') && !event.target.classList.contains('answered')) {
        const category = event.target.dataset.category;
        const value = parseInt(event.target.dataset.value);
        if (categories.includes(category)) {
            socket.emit('selectQuestion', { category, value });
        }
    }
});

if (buzzerButton) {
    buzzerButton.addEventListener('click', () => {
        if (canBuzzIn) {
            socket.emit('playerBuzzIn', { playerName: userName });
            disableBuzzer();
        }
    });
}

if (correctButton && incorrectButton && nextButton) {
    correctButton.addEventListener('click', () => {
        socket.emit('answerResult', { correct: true });
        // Clear gamemaster view after correct answer
        document.getElementById('gm-question').textContent = '';
        document.getElementById('gm-answer').textContent = '';
        document.getElementById('buzzed-player').textContent = '';
    });

    incorrectButton.addEventListener('click', () => {
        socket.emit('answerResult', { correct: false });
        // Keep the question and answer visible for next player
        document.getElementById('buzzed-player').textContent = '';
    });

    nextButton.addEventListener('click', () => {
        socket.emit('nextQuestion');
        // Clear gamemaster view
        document.getElementById('gm-question').textContent = '';
        document.getElementById('gm-answer').textContent = '';
        document.getElementById('buzzed-player').textContent = '';
    });
}

// Helper Functions
function showView(viewName) {
    Object.values(views).forEach(view => view.style.display = 'none');
    views[viewName].style.display = 'block';
}

function updateConnectionStatus(status, message) {
    const connectionStatus = document.getElementById('connection-status');
    connectionStatus.textContent = message;
    connectionStatus.className = status;
}

function fetchGames() {
    console.log('Fetching games...');
    fetch('/api/quizzes')
        .then(response => response.json())
        .then(games => {
            console.log('Fetched games:', games);
            const gamesGrid = document.getElementById('games-grid');
            gamesGrid.innerHTML = '';
            games.forEach(game => {
                const gameBox = document.createElement('div');
                gameBox.className = 'game-box';
                gameBox.textContent = game.name;
                gameBox.addEventListener('click', () => {
                    socket.emit('startGame', game._id);
                });
                gamesGrid.appendChild(gameBox);
            });
        })
        .catch(error => {
            console.error('Error fetching games:', error);
        });
}

function updatePlayersList() {
    const playersList = document.getElementById('players-list');
    if (!playersList) return;
    
    playersList.innerHTML = '';
    Object.values(currentPlayers).forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.textContent = player.name;
        playersList.appendChild(playerItem);
    });
}

// Keepalive mechanism
setInterval(() => {
    if (socket.connected) {
        socket.emit('keepalive');
    }
}, 20000);
