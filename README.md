# Matching Game

This is a basic word matching game designed for Japanese students learning English as a second language.  

The program is designed to run in a web browser on students' iPads.  

The functionality has now been significantly fleshed-out and play-tested with real students to help refine it.  

Word lists are used to produce pairs of words, phrases, or even word-and-picture pairs. Tapping on words pronounces them using basic speech synthesis (best used on iPads).  
There are three levels of difficulty, and the amount of rounds can also be modified.  
Level 2 and 3 difficulties prevent repeated words between some rounds, making it harder for students to use phrases they already figured out in the directly preceding round.  

The game keeps score for the individual player until the page is refreshed.  It will show each round's score, add it to the total score between rounds, and present the total score at the end of that round.  

Hints are given if students get three incorrect answers.  

All the setting selections are represented with a unique QR code for students to scan, which will take them to the correct game mode.  

This program is intended to use many different JSON files for a variety of word lists.  
To add a word list, place it in the root or a sub-directory of the `activities` directory, then add it to `index.json` with an accompanying ID (this can be anything), a title (this is what will be shown on the start page in the drop-down list), and the (relative) filepath.  
Please note that the JSON objects are generic - you can call them anything, but I recommend making them descriptive.  
The `alsoValid` field allows you to add matches that make sense but aren't "correct" for the current grammar that the students are learning. This will given them an error without outright marking their answer as wrong.  

I am open to word list pull requests, but please be aware that I'm focused on the Sunshine and Junior Sunshine books, and have access to Let's Try as well.  
Beyond that, I cannot confirm the contents of other textbooks (e.g. New Horizons), so I might not accept pull requests for those.  

Please note that this program's website might be blocked by your Board of Education or school. I was able to get it whitelisted by emailing my BOE and explaining what the program was (and that it doesn't collect personal data or use external services, since privacy of school children is a very serious issue in Japan).  

The [qrcodejs](https://github.com/davidshimjs/qrcodejs) library included in this project uses the MIT license.
