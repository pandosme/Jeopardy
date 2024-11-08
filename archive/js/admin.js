document.getElementById('question-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const questionData = {
    category: document.getElementById('category').value,
    value: document.getElementById('value').value,
    question: document.getElementById('question').value,
    answer: document.getElementById('answer').value
  };

  try {
    const response = await fetch('/api/questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(questionData)
    });

    if (response.ok) {
      alert('Question added successfully');
      e.target.reset();
    } else {
      alert('Error adding question');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error adding question');
  }
});
