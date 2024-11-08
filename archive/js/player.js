const socket = io({
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

const playerRegistration = document.getElementById('player-registration');
const gameInterface = document.getElementById('game-interface');
const registrationForm = document.getElementById('registration-form');
const playerNameInput = document.getElementById('player-name');
const playerNameDisplay = document.getElementById('player-name-display');
const playerScoreDisplay = document.getElementById('player-score');
const buzzerButton = document.getElementById('buzzer');
const statusMessage = document.getElementById('status-message');
const connectionStatus = document.getElementById('connection-status');

let playerName = localStorage.getItem('playerName');
let canBuzzIn = false;

function updateConnectionStatus(status, message) {
  connectionStatus.textContent = message;
  connectionStatus.className = status;
}

socket.on('connect', () => {
  console.log('Connected to server');
  updateConnectionStatus('connected', 'Connected to server');
  if (playerName) {
    socket.emit('checkPlayerStatus', playerName);
  } else {
    showRegistrationForm();
  }
});

socket.on('playerStatus', (status) => {
  if (status.registered) {
    showGameInterface(status.name, status.score);
  } else {
    showRegistrationForm();
  }
});

socket.on('playerNotFound', () => {
  localStorage.removeItem('playerName');
  showRegistrationForm();
});


socket.on('registrationSuccess', (data) => {
  playerName = data.name;
  localStorage.setItem('playerName', data.name);
  showGameInterface(data.name, data.score);
});

socket.on('registrationFailed', (data) => {
  alert(data.message);
  showRegistrationForm();
});

socket.on('gameStarted', (data) => {
  statusMessage.textContent = `Game started: ${data.quizName}`;
  disableBuzzer();
});

socket.on('questionSelected', (data) => {
  statusMessage.textContent = `${data.category} for $${data.value}`;
  enableBuzzer();
});

socket.on('playerBuzzed', (data) => {
  if (data.playerId === socket.id) {
    statusMessage.textContent = "You buzzed in! Wait for the game master.";
    buzzerButton.style.backgroundColor = 'green';
  } else {
    statusMessage.textContent = `${data.playerName} buzzed in!`;
    disableBuzzer();
  }
});

socket.on('enableActiveBuzzers', (activePlayers) => {
  if (activePlayers.includes(socket.id)) {
    enableBuzzer();
  } else {
    disableBuzzer();
  }
});

socket.on('correctAnswer', (data) => {
  statusMessage.textContent = `${data.playerName} answered correctly!`;
  if (playerName === data.playerName) {
    playerScoreDisplay.textContent = data.newScore;
  }
  disableBuzzer();
});

socket.on('wrongAnswer', (data) => {
  statusMessage.textContent = `${data.playerName} answered incorrectly.`;
  if (socket.id === data.playerId) {
    playerScoreDisplay.textContent = data.newScore;
    disableBuzzer();
  }
});

socket.on('disableBuzzers', () => {
  disableBuzzer();
});

socket.on('questionAnswered', () => {
  disableBuzzer();
  statusMessage.textContent = 'Waiting for next question...';
});

registrationForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = playerNameInput.value.trim();
  if (name) {
    registerPlayer(name);
  }
});

buzzerButton.addEventListener('click', () => {
  if (canBuzzIn) {
    socket.emit('playerBuzzIn', { playerName: playerName });
    disableBuzzer();
    statusMessage.textContent = "You buzzed in! Wait for the game master.";
  }
});

function registerPlayer(name) {
  const formattedName = formatPlayerName(name);
  if (isValidPlayerName(formattedName)) {
    playerName = formattedName;
    localStorage.setItem('playerName', formattedName);
    socket.emit('playerRegister', { playerName: formattedName });
  } else {
    alert('Invalid player name. Use 2-20 characters, letters, numbers, spaces, or hyphens.');
    showRegistrationForm();
  }
}

function showRegistrationForm() {
  playerRegistration.style.display = 'block';
  gameInterface.style.display = 'none';
}

function showGameInterface(name, score) {
  playerRegistration.style.display = 'none';
  gameInterface.style.display = 'block';
  playerNameDisplay.textContent = name;
  playerScoreDisplay.textContent = score;
  disableBuzzer();
}

function enableBuzzer() {
  buzzerButton.disabled = false;
  buzzerButton.classList.add('active');
  buzzerButton.style.backgroundColor = 'red';
  canBuzzIn = true;
}

function disableBuzzer() {
  buzzerButton.disabled = true;
  buzzerButton.classList.remove('active');
  buzzerButton.style.backgroundColor = '#cccccc';
  canBuzzIn = false;
}

function formatPlayerName(name) {
  // Remove leading/trailing whitespace and replace multiple spaces with a single space
  return name.trim().replace(/\s+/g, ' ');
}

function isValidPlayerName(name) {
  // Allow letters (including Swedish characters), numbers, spaces, and hyphens
  // Minimum length of 2 characters, maximum length of 20 characters
  const regex = /^[a-zA-ZåäöÅÄÖ0-9 -]{2,20}$/;
  return regex.test(name);
}
