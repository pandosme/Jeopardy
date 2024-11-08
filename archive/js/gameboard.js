const socket = io();

console.log('Game Board script loaded');

const gameBoard = document.getElementById('game-board');
const currentPlayerDisplay = document.getElementById('current-player');
const gameTitleDisplay = document.getElementById('game-title');
const questionSplash = document.getElementById('question-splash');
const questionText = document.getElementById('question-text');

let categories = [];
let questions = {};

socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('requestGameData');
});

socket.on('redirectView', (url) => {
  console.log('Redirection URL:', url);
  window.location.href = url;
});

socket.on('gameStarted', (data) => {
    console.log('Game started with quiz:', data.quizName);
    gameTitleDisplay.textContent = data.quizName; // Update the game title
    currentPlayerDisplay.textContent = '';
});

socket.on('gameData', (data) => {
    console.log('Received game data:', data);
    categories = data.categories;
    questions = data.questions;
    renderGameBoard();
});

socket.on('questionSelected', (data) => {
  console.log('Question selected by game master:', data);
  highlightSelectedQuestion(data.category, data.value);
  currentPlayerDisplay.textContent = '';
  setTimeout( function() {
	showQuestionSplash(data.question);
  },3000);
});

socket.on('playerBuzzed', (data) => {
  console.log('Player buzzed in:', data.playerName);
  currentPlayerDisplay.textContent = data.playerName;
});


socket.on('correctAnswer', (data) => {
  updateQuestionStatus(data.category, data.value);
  currentPlayerDisplay.textContent = '';
});

socket.on('wrongAnswer', (data) => {
    // Don't clear the question from the board for wrong answers
    currentPlayerDisplay.textContent = '';
});

socket.on('questionAnswered', (data) => {
  updateQuestionStatus(data.category, data.value);
  currentPlayerDisplay.textContent = '';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
});

function highlightSelectedQuestion(category, value) {
  const questionElement = gameBoard.querySelector(`[data-category="${category}"][data-value="${value}"]`);
  if (questionElement) {
    questionElement.classList.add('selected');
  }
}

function updateQuestionStatus(category, value) {
  const questionElement = gameBoard.querySelector(`[data-category="${category}"][data-value="${value}"]`);
  if (questionElement) {
    questionElement.classList.remove('selected');
    questionElement.textContent = '';
    questionElement.classList.add('answered');
  }
}

function renderGameBoard() {
    gameBoard.innerHTML = '';
    
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
            questionElement.textContent = `$${value}`;
            questionElement.dataset.category = category;
            questionElement.dataset.value = value;
            
            const question = questions[category].find(q => q.value === value);
            if (question && question.answered) {
                questionElement.classList.add('answered');
            }

            gameBoard.appendChild(questionElement);
        });
    });
}

// Event delegation for question selection
gameBoard.addEventListener('click', (event) => {
    if (event.target.classList.contains('question-value') && !event.target.classList.contains('answered')) {
        const category = event.target.dataset.category;
        const value = event.target.dataset.value;
        console.log('Question selected:', category, value);
        socket.emit('selectQuestion', { category, value });
    }
});

function showQuestionSplash(question) {
  questionText.textContent = question;
  questionSplash.classList.remove('hidden', 'wrong');
}

function hideQuestionSplash() {
  questionSplash.classList.add('hidden');
}

socket.on('correctAnswer', (data) => {
  updateQuestionStatus(data.category, data.value);
  currentPlayerDisplay.textContent = '';
  hideQuestionSplash();
});

socket.on('wrongAnswer', (data) => {
  currentPlayerDisplay.textContent = '';
  questionSplash.classList.add('wrong');
});

socket.on('hideQuestionSplash', () => {
    hideQuestionSplash();
});

socket.on('nextQuestion', () => {
  hideQuestionSplash();
});
