const mongoose = require('mongoose');

const QuizSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String
});

const QuestionSchema = new mongoose.Schema({
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  category: String,
  value: Number,
  question: String,
  answer: String
});

const Quiz = mongoose.model('Quiz', QuizSchema);
const Question = mongoose.model('Question', QuestionSchema);

module.exports = { Quiz, Question };
