const socket = io();

const quizSelect = document.getElementById('quiz-select');
const startGameBtn = document.getElementById('start-game');

// Fetch available quizzes when the page loads
fetch('/api/quizzes')
  .then(response => response.json())
  .then(quizzes => {
    quizzes.forEach(quiz => {
      const option = document.createElement('option');
      option.value = quiz._id;
      option.textContent = quiz.name;
      quizSelect.appendChild(option);
    });
  });

startGameBtn.addEventListener('click', () => {
  const selectedQuizId = quizSelect.value;
  if (selectedQuizId) {
    console.log('Starting game with quiz:', selectedQuizId);
    socket.emit('startGame', selectedQuizId);
  } else {
    alert('Please select a quiz before starting the game.');
  }
});

socket.on('gameStarted', (data) => {
  alert(`Game started with quiz: ${data.quizName}`);
});

socket.on('gameError', (data) => {
  alert(`Error: ${data.message}`);
});
