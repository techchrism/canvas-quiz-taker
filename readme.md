# Canvas Quiz Taker

### Tool to automate taking multiple-choice quizzes with unlimited attempts

Example showing a quiz with 14 questions in the bank showing a random 5 per attempt:

![Screenshot showing operation - 15 quiz attempts followed by the answers](https://i.imgur.com/q4FoOui.png)

(Questions from <https://www.orau.gov/sciencebowl/files/teams/biolset2.pdf>)

## How it works
The script uses the official Canvas API to continually retake the quiz until it is "satisfied".

When taking the quiz, it stores all encountered questions and attempted answers.
If it doesn't know the answer to a question, it picks randomly from available options it hasn't answered previously.
When it finds the answer, it continually answers correctly whenever the question is encountered again.

This continues until two conditions are met:
 - For all questions it has seen so far, it has seen each of them at least twice
 - It knows the answer to every question it has seen

## How to use
 - [Get a Canvas token](https://community.canvaslms.com/t5/Student-Guide/How-do-I-manage-API-access-tokens-as-a-student/ta-p/273)
 - Double-check that your quiz allows unlimited attempts
 - Enter the token and the quiz url into `config.json`
 - Run `node index.js`

## Room for improvement
 - Configurable timeouts for when emulating human behavior is unnecessary
 - Export results to flashcard formats (Anki)
 - Command line options / interface for specifying quiz url rather than using a config file
 - Get and utilize quiz title and class title
 - Ensure quizzes allow unlimited attempts to prevent accidents
