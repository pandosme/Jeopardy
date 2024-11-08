const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('index');
});

router.get('/admin', (req, res) => {
  res.render('admin');
});

router.get('/gameboard', (req, res) => {
  res.sendFile('gameboard.html', { root: './public' });
});

router.get('/player', (req, res) => {
  res.sendFile('player.html', { root: './public' });
});

router.get('/gamemaster', (req, res) => {
  res.sendFile('gamemaster.html', { root: './public' });
});

module.exports = router;
