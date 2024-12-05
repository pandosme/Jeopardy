const fs = require('fs');
const path = require('path');
const csv = require('csv-parse');

class Quiz {
    constructor(name) {
        this.name = name;
    }

    static async findById(filename) {
        const name = path.basename(filename, '.csv');
        return new Quiz(name);
    }

    static async find() {
        const quizDirectory = path.join(__dirname, '..', 'quizzes');
        return new Promise((resolve, reject) => {
            fs.readdir(quizDirectory, (err, files) => {
                if (err) reject(err);
                const csvFiles = files.filter(file => path.extname(file).toLowerCase() === '.csv');
                const quizzes = csvFiles.map(file => ({
                    _id: file,
                    name: path.basename(file, '.csv')
                }));
                resolve(quizzes);
            });
        });
    }
}

class Question {
    static async find({ quiz }) {
        const quizPath = path.join(__dirname, '..', 'quizzes', quiz);
        return new Promise((resolve, reject) => {
            const questions = [];
            fs.createReadStream(quizPath)
                .pipe(csv.parse({ columns: true, trim: true }))
                .on('data', (row) => {
                    questions.push({
                        quiz: quiz,
                        category: row.Category,
                        value: parseInt(row.Value),
                        question: row.Question,  // Show this to players (the "answer")
                        answer: row.Answer,      // What players should respond with (the "question")
                        answered: false
                    });
                })
                .on('end', () => resolve(questions))
                .on('error', reject);
        });
    }
}

module.exports = { Quiz, Question };
