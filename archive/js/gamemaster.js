const socket = io();

const quizNameDisplay = document.getElementById('quiz-name');
const currentCategoryDisplay = document.getElementById('current-category');
const currentValueDisplay = document.getElementById('current-value');
const currentQuestionDisplay = document.getElementById('current-question-display');
const currentAnswerDisplay = document.getElementById('current-answer-display');
const buzzedInPlayerDisplay = document.getElementById('buzzed-in-player');
const playerScoresList = document.getElementById('player-scores');
const correctAnswerBtn = document.getElementById('correct-answer');
const incorrectAnswerBtn = document.getElementById('wrong-answer');
const nextQuestionBtn = document.getElementById('next-question');

socket.on('connect', () => {
  console.log('Connected to server');
  socket.emit('gameMasterConnected', socket.id);
  socket.emit('updateGameMaster');
});

socket.on('redirectView', (url) => {
  console.log('Redirection URL:', url);
  window.location.href = url;
});

socket.on('gameStateUpdate', (data) => {
    quizNameDisplay.textContent = data.quizName;
    currentCategoryDisplay.textContent = data.currentCategory;
    currentValueDisplay.textContent = data.currentValue;
    currentQuestionDisplay.textContent = data.currentQuestion;
    currentAnswerDisplay.textContent = data.currentAnswer;
    updateScoreboard(data.players);
});

socket.on('questionSelected', (data) => {
  console.log('Question selected:', data);
  currentCategoryDisplay.textContent = data.category;
  currentValueDisplay.textContent = data.value;
  currentQuestionDisplay.textContent = data.question;
  currentAnswerDisplay.textContent = data.answer;
  buzzedInPlayerDisplay.textContent = 'No player buzzed in yet';
  enableAnswerButtons(false);
});

socket.on('playerBuzzed', (data) => {
  console.log('Player buzzed in:', data.playerName);
  buzzedInPlayerDisplay.textContent = `${data.playerName} buzzed in!`;
  enableAnswerButtons(true);
});

socket.on('updateScores', (scores) => {
    updateScoreboard(scores);
});

socket.on('gameStarted', (data) => {
    quizNameDisplay.textContent = data.quizName;
    resetDisplays();
});

socket.on('questionAnswered', (data) => {
    resetDisplays();
});

function resetDisplays() {
    currentCategoryDisplay.textContent = 'None';
    currentValueDisplay.textContent = 'None';
    currentQuestionDisplay.textContent = 'No question selected';
    currentAnswerDisplay.textContent = 'No answer available';
    buzzedInPlayerDisplay.textContent = 'No player buzzed in yet';
    enableAnswerButtons(false);
}

function updateScoreboard(scores) {
    playerScoresList.innerHTML = '';
    Object.entries(scores).forEach(([playerName, score]) => {
        const li = document.createElement('li');
        li.textContent = `${playerName}: $${score}`;
        playerScoresList.appendChild(li);
    });
}

function enableAnswerButtons(enable) {
    correctAnswerBtn.disabled = !enable;
    incorrectAnswerBtn.disabled = !enable;
}

correctAnswerBtn.addEventListener('click', () => {
  console.log('Marking answer as correct');
  socket.emit('answerResult', { correct: true });
  enableAnswerButtons(false);
});

incorrectAnswerBtn.addEventListener('click', () => {
  console.log('Marking answer as incorrect');
  socket.emit('answerResult', { correct: false });
  enableAnswerButtons(false);
});


nextQuestionBtn.addEventListener('click', () => {
  console.log('Moving to next question');
  socket.emit('nextQuestion');
  resetDisplays();
});

// Set button styles
correctAnswerBtn.style.backgroundColor = 'green';
correctAnswerBtn.style.color = 'white';
correctAnswerBtn.textContent = 'Correct';

incorrectAnswerBtn.style.backgroundColor = 'red';
incorrectAnswerBtn.style.color = 'white';
incorrectAnswerBtn.textContent = 'Wrong';

nextQuestionBtn.style.backgroundColor = 'yellow';
nextQuestionBtn.style.color = 'black';
nextQuestionBtn.textContent = 'Next';

// Initially disable answer buttons
enableAnswerButtons(false);
