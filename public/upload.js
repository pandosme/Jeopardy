const dropArea = document.getElementById('drop-area');
const statusDiv = document.getElementById('status');
const fileInput = document.getElementById('fileElem');

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight drop zone
['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
    dropArea.classList.add('highlight');
}

function unhighlight(e) {
    dropArea.classList.remove('highlight');
}

dropArea.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    handleFile(file);
}

function validateCSV(csv) {
    const lines = csv.split('\n').map(line => line.trim()).filter(line => line);
    const errors = [];
    
    // Check if file is empty
    if (lines.length === 0) {
        errors.push('File is empty');
        return { valid: false, errors };
    }

    // Check header
    const header = lines[0].split(',').map(h => h.trim());
    const expectedHeader = ['Category', 'Value', 'Question', 'Answer'];
    if (!expectedHeader.every((h, i) => header[i] === h)) {
        errors.push(`Invalid header row. Expected: ${expectedHeader.join(',')} but got: ${header.join(',')}`);
        return { valid: false, errors };
    }

    // Validate each row
    const questions = [];
    for (let i = 1; i < lines.length; i++) {
        const lineNumber = i + 1;
        const line = lines[i];
        const fields = line.split(',').map(field => field.trim());
        
        // Check number of fields
        if (fields.length !== 4) {
            errors.push(`Line ${lineNumber}: Expected 4 fields but got ${fields.length}`);
            continue;
        }

        const [category, value, question, answer] = fields;
        
        // Check for empty fields
        if (!category) errors.push(`Line ${lineNumber}: Missing category`);
        if (!value) errors.push(`Line ${lineNumber}: Missing value`);
        if (!question) errors.push(`Line ${lineNumber}: Missing question`);
        if (!answer) errors.push(`Line ${lineNumber}: Missing answer`);

        // Validate value is a number
        const valueNum = parseInt(value);
        if (isNaN(valueNum)) {
            errors.push(`Line ${lineNumber}: Value '${value}' is not a valid number`);
        } else if (![100, 200, 300, 400, 500].includes(valueNum)) {
            errors.push(`Line ${lineNumber}: Value must be one of: 100, 200, 300, 400, 500`);
        }

        if (!errors.length) {
            questions.push({ category, value: valueNum, question, answer });
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        questions
    };
}

function handleFile(file) {
    if (!file) {
        showError('No file selected');
        return;
    }

    if (!file.name.endsWith('.csv')) {
        showError('File must be a CSV file');
        return;
    }

    showStatus('Validating file...');

    const reader = new FileReader();
    reader.readAsText(file);
    reader.onload = function(event) {
        const csv = event.target.result;
        const validation = validateCSV(csv);
        
        if (!validation.valid) {
            showError('Validation Errors:', validation.errors);
            return;
        }

        uploadCSV(csv, file.name);
    };

    reader.onerror = function() {
        showError('Error reading file');
    };
}

function showError(title, errors = []) {
    const statusDiv = document.getElementById('status');
    let html = `<div class="error-message">`;
    html += `<h3>${title}</h3>`;
    
    if (Array.isArray(errors) && errors.length > 0) {
        html += '<ul>';
        errors.forEach(error => {
            html += `<li>${error}</li>`;
        });
        html += '</ul>';
    }
    
    html += '</div>';
    statusDiv.innerHTML = html;
}

function showStatus(message) {
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = `<div class="status-message">${message}</div>`;
}


function uploadCSV(csv, fileName) {
    showStatus('Uploading...');
    
    fetch('/api/upload-game', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            csv, 
            fileName 
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(`
                <div class="success-message">
                    Game uploaded successfully!<br>
                    ${data.questionCount} questions processed.
                </div>
            `);
        } else {
            showError('Upload Failed', data.errors || [data.message]);
        }
    })
    .catch(error => {
        showError('Upload Error', [error.message]);
    });
}

// Handle click-to-upload
dropArea.onclick = () => fileInput.click();
fileInput.onchange = function() {
    handleFile(this.files[0]);
};
