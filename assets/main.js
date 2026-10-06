const PAIRS_PER_ROUND = 6;
const TOTAL_ROUNDS = 10;
const PALETTE = ["#fca5a5", "#fdba74", "#fde047", "#86efac", "#7dd3fc", "#c4b5fd"];

const state = {
    phrases: [],
    score: 0,
    maxScore: 0,
    round: 0,
    selected: null,
    pairsLeft: 0,
    colourIndex: 0,
    streak: 0,              // matches in a row (a mistake resets it)
    missesInARow: 0,        // drives the Japanese hint
    roundHadMistake: false
};

const screens = {
    start: document.querySelector(".start-screen"),
    game: document.querySelector(".game-screen"),
    end: document.querySelector(".end-screen")
};
const board = document.querySelector(".board");
const playButton = document.querySelector(".play-button");
const nextButton = document.querySelector(".next-round");
const playAgainButton = document.querySelector(".play-again");
const scoreBox = document.querySelector(".score-box");
const feedback = document.querySelector(".feedback");
const feedbackPoints = document.querySelector(".points");

playButton.addEventListener("click", startGame);
playAgainButton.addEventListener("click", startGame);
nextButton.addEventListener("click", () => {
    if (state.round >= TOTAL_ROUNDS) {
        finishGame();
    } else {
        startRound();
    }
});

// ---------- small helpers ----------
function showScreen(name) {
    for (const [key, element] of Object.entries(screens)) {
        element.hidden = (key !== name);
    }
}

// Removes and re-adds a class so a CSS animation plays again from the start
function restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;   // makes the browser notice the removal
    element.classList.add(className);
}

function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// ---------- speech ----------
function speak(text) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.7;
    speechSynthesis.speak(utterance);
}

// ---------- loading data ----------
async function loadActivity() {
    const response = await fetch("activities/s1p2_basicdialogs.json");
    if (!response.ok) {
        throw new Error("HTTP error " + response.status);
    }
    return response.json();
}

function preparePhrases(rawPhrases) {
    return rawPhrases
        .map((p, index) => ({
            id: index,
            verb: p.verb,
            object: p.en.slice(p.verb.length).trim(),
            en: p.en,
            ja: p.ja,
            emoji: p.emoji
        }))
        .filter(p => p.object !== "");
}

// ---------- building a round ----------
function pickRound(phrases) {
    const usedVerbs = new Set();
    const round = [];
    for (const phrase of shuffle(phrases)) {
        if (usedVerbs.has(phrase.verb)) continue;
        usedVerbs.add(phrase.verb);
        round.push(phrase);
        if (round.length === PAIRS_PER_ROUND) break;
    }
    return round;
}

function makeCard(phrase, side) {
    const word = side === "verb" ? phrase.verb : phrase.object;

    const card = document.createElement("button");
    card.className = "card " + side;
    card.dataset.pairId = phrase.id;
    card.dataset.side = side;
    card.dataset.word = word;
    card.dataset.phrase = phrase.en;

    if (side === "object" && phrase.emoji) {
        const picture = document.createElement("span");
        picture.className = "picture";
        picture.textContent = phrase.emoji;
        card.append(picture);
    }

    const text = document.createElement("span");
    text.className = "text";

    const label = document.createElement("span");
    label.className = "word";
    label.textContent = word;
    text.append(label);

    if (phrase.ja) {
        const hint = document.createElement("span");
        hint.className = "hint";          // hidden until the card gets "show-hint"
        hint.textContent = phrase.ja;
        text.append(hint);
    }

    card.append(text);
    card.addEventListener("click", handleCardClick);
    return card;
}

function startGame() {
    state.score = 0;
    state.maxScore = 0;
    state.round = 0;
    drawScore();
    showScreen("game");
    startRound();
}

function startRound() {
    state.round += 1;
    state.selected = null;
    state.colourIndex = 0;
    state.streak = 0;
    state.missesInARow = 0;
    state.roundHadMistake = false;
    nextButton.hidden = true;

    const round = pickRound(state.phrases);
    state.pairsLeft = round.length;
    state.maxScore += maxRoundScore(round.length);
    document.querySelector(".round").textContent = state.round;

    // One shared grid: card i of each column sits in the same row
    const verbs = shuffle(round);
    const objects = shuffle(round);
    board.replaceChildren();
    for (let i = 0; i < round.length; i++) {
        board.append(makeCard(verbs[i], "verb"), makeCard(objects[i], "object"));
    }
}

function finishGame() {
    const ratio = state.score / state.maxScore;
    let message = "Give it another try! もう一度やって見よ！";
    if (ratio >= 0.8) {
        message = "Amazing! すごい！";
    } else if (ratio >= 0.5) {
        message = "Good job! よくできました！";
    }
    document.querySelector(".end-message").textContent = message;
    document.querySelector(".final-score").textContent = state.score + " / " + state.maxScore;
    showScreen("end");
}

// 1 point per match; every 3rd match in a row is worth 2;
// the last match of a round is worth 3 if the round had no mistakes
function pointsForMatch(streak, isLastMatch, roundHadMistake) {
    if (isLastMatch && !roundHadMistake) return 3;
    if (streak % 3 === 0) return 2;
    return 1;
}

// the best possible score for a round with this many pairs
function maxRoundScore(pairCount) {
    let total = 0;
    for (let i = 1; i <= pairCount; i++) {
        total += pointsForMatch(i, i === pairCount, false);
    }
    return total;
}

// ---------- playing ----------
function select(card) {
    state.selected = card;
    card.classList.add("selected");
    speak(card.dataset.word);
}

function deselect() {
    state.selected.classList.remove("selected");
    state.selected = null;
}

function handleCardClick(event) {
    const card = event.currentTarget;

    if (state.selected === null) {
        select(card);
    } else if (card === state.selected) {
        deselect();
    } else if (card.dataset.side === state.selected.dataset.side) {
        deselect();
        select(card);
    } else if (card.dataset.pairId === state.selected.dataset.pairId) {
        handleMatch(state.selected, card);
    } else {
        handleMiss(card);
    }
}

function handleMatch(first, second) {
    state.streak += 1;
    state.pairsLeft -= 1;
    const isLastMatch = state.pairsLeft === 0;
    const points = pointsForMatch(state.streak, isLastMatch, state.roundHadMistake);

    const colour = PALETTE[state.colourIndex % PALETTE.length];
    state.colourIndex += 1;

    for (const card of [first, second]) {
        card.classList.remove("selected");
        card.classList.add("matched");
        card.style.setProperty("--pair-colour", colour);
        card.disabled = true;
    }

    state.selected = null;
    state.missesInARow = 0;
    state.score += points;
    drawScore();
    restartAnimation(scoreBox, "pop");
    showFeedback(true, points);
    speak(first.dataset.phrase);

    setTimeout(() => {
        first.classList.add("gone");
        second.classList.add("gone");
    }, 700);

    if (isLastMatch) {
        nextButton.textContent = state.round >= TOTAL_ROUNDS ? "See results ★" : "Next round ▶";
        setTimeout(() => { nextButton.hidden = false; }, 1000);
    }
}

function handleMiss(card) {
    const first = state.selected;
    deselect();
    state.streak = 0;
    state.missesInARow += 1;
    state.roundHadMistake = true;
    showFeedback(false);
    speak(card.dataset.word);   // say the word they just tapped, on its own

    for (const c of [first, card]) c.classList.add("wrong");
    setTimeout(() => {
        for (const c of [first, card]) c.classList.remove("wrong");
    }, 500);

    if (state.missesInARow % 3 === 0) {
        revealHint(first.dataset.pairId);
    }
}

function revealHint(pairId) {
    document.querySelectorAll(`.card[data-pair-id="${pairId}"]`)
        .forEach(card => card.classList.add("show-hint"));
}

function drawScore() {
    document.querySelector(".score").textContent = state.score;
}

function showFeedback(isCorrect, points = 0) {
    feedback.classList.remove("maru", "batsu");
    feedback.classList.add(isCorrect ? "maru" : "batsu");
    feedbackPoints.textContent = isCorrect ? "+" + points : "";
    restartAnimation(feedback, "show");
}

// ---------- QR code ----------
function drawQrCode() {
    if (typeof QRCode === "undefined") return;
    new QRCode(document.querySelector(".qr-code"), {
        text: window.location.href,
        width: 320,
        height: 320
    });
}

// ---------- start ----------
async function init() {
    drawQrCode();
    document.querySelector(".total-rounds").textContent = TOTAL_ROUNDS;
    try {
        const data = await loadActivity();
        document.querySelector(".title").textContent = data.title;
        state.phrases = preparePhrases(data.phrases);
        playButton.disabled = false;
    } catch (error) {
        console.error(error);
        document.querySelector(".title").textContent = "Couldn't load the activity";
    }
}

init();