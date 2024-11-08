const mongoose = require('mongoose');
const config = require('./config/config.json')[process.env.NODE_ENV || 'development'];

mongoose.connect(config.mongodb.uri, config.mongodb.options);

const QuizSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String
});

const Quiz = mongoose.model('Quiz', QuizSchema);

const QuestionSchema = new mongoose.Schema({
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  category: String,
  value: Number,
  question: String,
  answer: String
});

const Question = mongoose.model('Question', QuestionSchema);

async function populateDatabase() {
  try {
    // Create a new quiz
    const metalQuiz = await Quiz.create({
      name: 'Heavy Metal Mayhem',
      description: 'Test your knowledge of heavy metal music across various categories!'
    });

    // Create questions for the quiz
    const questions = [
      // Metal Bands
      { quiz: metalQuiz._id, category: "Metal Bands", value: 100, question: "This 'priestly' British band is known for 'Breaking the Law'", answer: "Judas Priest" },
      { quiz: metalQuiz._id, category: "Metal Bands", value: 200, question: "Their album 'The Number of the Beast' is considered a classic of the genre", answer: "Iron Maiden" },
      { quiz: metalQuiz._id, category: "Metal Bands", value: 300, question: "This 'speedy' band is fronted by Dave Mustaine", answer: "Megadeth" },
      { quiz: metalQuiz._id, category: "Metal Bands", value: 400, question: "Known for their corpse paint, this Norwegian black metal band is named after a Tolkien character", answer: "Gorgoroth" },
      { quiz: metalQuiz._id, category: "Metal Bands", value: 500, question: "This Finnish 'love metal' band is fronted by Ville Valo", answer: "HIM" },

      // Metal Subgenres
      { quiz: metalQuiz._id, category: "Metal Subgenres", value: 100, question: "Characterized by its fast, aggressive sound, this subgenre includes bands like Slayer and Anthrax", answer: "Thrash Metal" },
      { quiz: metalQuiz._id, category: "Metal Subgenres", value: 200, question: "Known for its use of makeup and theatrical performances, this subgenre was popularized by KISS", answer: "Glam Metal" },
      { quiz: metalQuiz._id, category: "Metal Subgenres", value: 300, question: "This extreme subgenre is known for its growled vocals and blast beat drumming", answer: "Death Metal" },
      { quiz: metalQuiz._id, category: "Metal Subgenres", value: 400, question: "This subgenre combines elements of metal with classical music and often features symphonic instruments", answer: "Symphonic Metal" },
      { quiz: metalQuiz._id, category: "Metal Subgenres", value: 500, question: "This experimental subgenre often features long, complex songs and is exemplified by bands like Tool", answer: "Progressive Metal" },

      // Famous Metal Albums
      { quiz: metalQuiz._id, category: "Famous Metal Albums", value: 100, question: "Black Sabbath's 1970 self-titled debut album", answer: "Black Sabbath" },
      { quiz: metalQuiz._id, category: "Famous Metal Albums", value: 200, question: "Metallica's 1986 album featuring the song 'Master of Puppets'", answer: "Master of Puppets" },
      { quiz: metalQuiz._id, category: "Famous Metal Albums", value: 300, question: "Guns N' Roses' 1987 debut studio album", answer: "Appetite for Destruction" },
      { quiz: metalQuiz._id, category: "Famous Metal Albums", value: 400, question: "Pantera's influential 1990 album that redefined groove metal", answer: "Cowboys from Hell" },
      { quiz: metalQuiz._id, category: "Famous Metal Albums", value: 500, question: "Opeth's 2001 progressive death metal masterpiece", answer: "Blackwater Park" },

      // Metal Vocalists
      { quiz: metalQuiz._id, category: "Metal Vocalists", value: 100, question: "The lead singer of Black Sabbath, known as the 'Prince of Darkness'", answer: "Ozzy Osbourne" },
      { quiz: metalQuiz._id, category: "Metal Vocalists", value: 200, question: "Metallica's lead vocalist and rhythm guitarist", answer: "James Hetfield" },
      { quiz: metalQuiz._id, category: "Metal Vocalists", value: 300, question: "The frontman of Iron Maiden since 1981", answer: "Bruce Dickinson" },
      { quiz: metalQuiz._id, category: "Metal Vocalists", value: 400, question: "This Pantera vocalist was known for his powerful voice and stage presence", answer: "Phil Anselmo" },
      { quiz: metalQuiz._id, category: "Metal Vocalists", value: 500, question: "The lead singer of System of a Down, known for his unique vocal style", answer: "Serj Tankian" },

      // Metal Guitarists
      { quiz: metalQuiz._id, category: "Metal Guitarists", value: 100, question: "Guns N' Roses' iconic lead guitarist, known for his top hat", answer: "Slash" },
      { quiz: metalQuiz._id, category: "Metal Guitarists", value: 200, question: "This guitarist is known for tapping and his band Van Halen", answer: "Eddie Van Halen" },
      { quiz: metalQuiz._id, category: "Metal Guitarists", value: 300, question: "The lead guitarist of Black Sabbath, known for his heavy riffs", answer: "Tony Iommi" },
      { quiz: metalQuiz._id, category: "Metal Guitarists", value: 400, question: "This Megadeth frontman was also Metallica's original lead guitarist", answer: "Dave Mustaine" },
      { quiz: metalQuiz._id, category: "Metal Guitarists", value: 500, question: "This Swedish guitarist is known for his neoclassical playing style", answer: "Yngwie Malmsteen" }
    ];

    await Question.insertMany(questions);
    console.log('Database populated with new Heavy Metal quiz and questions');
  } catch (error) {
    console.error('Error populating database:', error);
  } finally {
    mongoose.connection.close();
  }
}

populateDatabase();
