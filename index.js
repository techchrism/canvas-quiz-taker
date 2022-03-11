const fetch = require('node-fetch');
const url = require('url');
const fs = require('fs').promises;

// From https://stackoverflow.com/a/1527820
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function asyncTimeout(delay) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, delay);
    });
}

function parseCanvasQuizUrl(urlStr) {
    const urlData = new url.URL(urlStr);
    let courseID = null;
    let quizID = null;
    const pathParts = urlData.pathname.split('/');
    for(let i = 0; i < pathParts.length - 1; i++) {
        if(pathParts[i] === 'courses') {
            courseID = pathParts[i + 1];
            i++;
        } else if(pathParts[i] === 'quizzes') {
            quizID = pathParts[i + 1];
            i++;
        }
    }

    return {
        origin: urlData.origin,
        courseID,
        quizID
    };
}

async function startQuiz(origin, courseID, quizID, token) {
    return await (await fetch(`${origin}/api/v1/courses/${courseID}/quizzes/${quizID}/submissions`, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token
        }
    })).json();
}

async function getQuestions(origin, submissionID, token) {
    return await (await fetch(`${origin}/api/v1/quiz_submissions/${submissionID}/questions`, {
        headers: {
            'Authorization': 'Bearer ' + token
        }
    })).json();
}

async function submitAnswers(origin, submissionID, token, attempt, validationToken, answers) {
    return await (await fetch(`${origin}/api/v1/quiz_submissions/${submissionID}/questions`, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            attempt,
            'validation_token': validationToken,
            'quiz_questions': answers
        })
    })).json();
}

async function submitQuiz(origin, courseID, quizID, submissionID, token, attempt, validationToken) {
    return await (await fetch(`${origin}/api/v1/courses/${courseID}/quizzes/${quizID}/submissions/${submissionID}/complete`, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            attempt,
            'validation_token': validationToken
        })
    })).json();
}

async function getQuizResults(origin, submissionID, token) {
    return await (await fetch(`${origin}/api/v1/quiz_submissions/${submissionID}/questions`, {
        headers: {
            'Authorization': 'Bearer ' + token,
        }
    })).json();
}

function printFormattedData(quizData) {
    for(const question of quizData.questions) {
        console.log(question.text.replace(/<[^>]*>?/gm, '') + ':');
        for(const answer of question.answers) {
            console.log('   ' + (answer.id === question.correctID ? '-> ' : '   ') + answer.text.replace(/<[^>]*>?/gm, ''));
        }
        console.log('');
    }
}

async function completeQuiz(quizData, token, submissionDelay) {
    if(!quizData.hasOwnProperty('questions')) {
        quizData.questions = [];
    }
    if(!quizData.hasOwnProperty('submissions')) {
        quizData.submissions = [];
    }

    // Start new quiz
    const newQuizResponse = await startQuiz(quizData.origin, quizData.courseID, quizData.quizID, token);
    if(!newQuizResponse.hasOwnProperty('quiz_submissions')) {
        console.log(JSON.stringify(newQuizResponse, null, 4));
        return;
    }
    const submission = {
        attempt: newQuizResponse['quiz_submissions'][0]['attempt'],
        id: newQuizResponse['quiz_submissions'][0]['id'],
        validationToken: newQuizResponse['quiz_submissions'][0]['validation_token']
    };
    quizData.submissions.push(submission);

    // Get quiz questions
    const canAnswerTypes = ['multiple_choice_question', 'true_false_question'];
    const questions = (await getQuestions(quizData.origin, submission.id, token))['quiz_submission_questions'];
    const answers = [];
    for(const question of questions) {
        if(!canAnswerTypes.includes(question['question_type'])) {
            console.log(`Cannot answer question of type ${question['question_type']} (id: ${question.id})`);
            return;
        }

        // See if we've encountered the question before
        const existingQuestion = quizData.questions.find(existing => existing.id === question.id);
        if(existingQuestion === undefined) {
            const attempt = question['answers'][getRandomInt(0, question['answers'].length - 1)].id;
            quizData.questions.push({
                id: question.id,
                type: question['question_type'],
                text: question['question_text'],
                answers: question['answers'],
                attempted: [attempt],
                correctID: null,
                encountered: 1
            });
            answers.push({
                id: question.id,
                answer: attempt
            });
        } else {
            existingQuestion.encountered++;
            if(existingQuestion.correctID !== null) {
                answers.push({
                    id: question.id,
                    answer: existingQuestion.correctID
                });
            } else {
                const remainingAnswers = question.answers.filter(answer => !existingQuestion.attempted.includes(answer.id));
                const attempt = remainingAnswers[getRandomInt(0, remainingAnswers.length - 1)].id;
                existingQuestion.attempted.push(attempt);
                answers.push({
                    id: question.id,
                    answer: attempt
                });
            }
        }
    }

    await asyncTimeout(submissionDelay);

    // Submit answers
    const submissionData = await submitAnswers(quizData.origin, submission.id, token, submission.attempt, submission.validationToken, answers);

    // Finish quiz
    const finishData = await submitQuiz(quizData.origin, quizData.courseID, quizData.quizID, submission.id, token, submission.attempt, submission.validationToken);

    // Get quiz results
    let correctCount = 0;
    const quizResults = (await getQuizResults(quizData.origin, submission.id, token))['quiz_submission_questions'];
    for(const result of quizResults) {
        const existingQuestion = quizData.questions.find(existing => existing.id === result.id);
        if(result['correct'] === true) {
            correctCount++;
            if(existingQuestion.correctID === null) {
                existingQuestion.correctID = answers.find(answer => answer.id === result.id).answer;
            }
        }
    }
    console.log(`Attempt ${submission.attempt} got ${correctCount}/${quizResults.length} correct (seen ${quizData.questions.length}, know ${
        quizData.questions.reduce((t,q) => t+(q.correctID!==null?1:0),0)
    }, confirming ${
        quizData.questions.reduce((t,q) => t+(q.encountered===1?1:0),0)
    })`);

    return quizData;
}

function isSatisfied(quizData) {
    if(!quizData.hasOwnProperty('questions') || quizData.questions.length === 0) return false;

    // Ensure every question is correct and has been seen twice
    for(const question of quizData.questions) {
        if(question.encountered < 2 || question.correctID === null) {
            return false;
        }
    }
    return true;
}

(async () => {
    // Load config data
    let quizUrl, token;
    try {
        ({quizUrl, token} = JSON.parse(await fs.readFile('config.json', 'utf-8')));
        if(!quizUrl) throw new Error('Empty quiz url');
        if(!token) throw new Error('Empty token');
    } catch(e) {
        console.error('Error loading config:');
        console.error(e);
        return;
    }

    const {origin, courseID, quizID} = parseCanvasQuizUrl(quizUrl);

    let quizData = {origin, courseID, quizID};
    // Try loading existing quiz data
    try {
        await fs.mkdir('./quiz-data');
    } catch(ignored) {}
    try {
        quizData = JSON.parse(await fs.readFile(`./quiz-data/${quizID}.json`, 'utf-8'));
    } catch(ignored) {}

    // Continually take the quiz until satisfied
    while(!isSatisfied(quizData)) {
        const submissionDelay = getRandomInt(60 * 1000, 180 * 1000);
        const retakeDelay = getRandomInt(5 * 1000, 15 * 1000);
        try {
            quizData = await completeQuiz(quizData, token, submissionDelay);
        } catch(e) {
            console.error(e);
        }
        await fs.writeFile(`./quiz-data/${quizID}.json`, JSON.stringify(quizData, null, 4), 'utf-8');

        await asyncTimeout(retakeDelay);
    }

    // Display the quiz results
    console.log('Results:');
    console.log('');
    printFormattedData(quizData);
})();
