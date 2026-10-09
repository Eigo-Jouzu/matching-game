// ---------- settings ----------
const LEVELS = {
    1: { pairs: 4, cooldown: 0, label: "4 pairs · phrases can repeat straight away" },
    2: { pairs: 5, cooldown: 1, label: "5 pairs · phrases rest for 1 round" },
    3: { pairs: 6, cooldown: 2, label: "6 pairs · phrases rest for 2 rounds" }
};
const MIN_ROUNDS = 3;
const MAX_ROUNDS = 20;
const SECONDS_PER_PAIR = 6;
const NEXT_ROUND_SECONDS = 6;
const PERFECT_ROUND_BONUS = 3;
const NEAR_MISS_MESSAGE = "Good thinking! But not this phrase. いい考え！でも今回はちがうよ";
const PALETTE = ["#fca5a5", "#fdba74", "#fde047", "#86efac", "#7dd3fc", "#c4b5fd"];

const state = {
    activities: [],
    settings: { listId: null, rounds: 10, level: 3 },
    title: "",
    items: [],              // every pair in the word list
    alsoValid: new Set(),   // extra sensible combinations, from the word list
    score: 0,
    roundScore: 0,
    maxScore: 0,
    round: 0,
    selected: null,
    pairsLeft: 0,
    colourIndex: 0,
    streak: 0,
    missesInARow: 0,
    roundHadMistake: false,
    roundTimer: null,
    nextTimer: null,
    transferTimer: null
};

// ---------- page elements ----------
const screens = {
    start: document.querySelector(".start-screen"),
    game: document.querySelector(".game-screen"),
    end: document.querySelector(".end-screen")
};
const board = document.querySelector(".board");
const playButton = document.querySelector(".play-button");
const nextButton = document.querySelector(".next-round");
const playAgainButton = document.querySelector(".play-again");
const menuButton = document.querySelector(".menu-button");
const roundScoreBox = document.querySelector(".round-score-box");
const totalScoreBox = document.querySelector(".total-score-box");
const feedback = document.querySelector(".feedback");
const feedbackPoints = document.querySelector(".points");
const toast = document.querySelector(".toast");
const timerBar = document.querySelector(".timer");
const timerFill = document.querySelector(".timer-fill");
const titleElement = document.querySelector(".title");
const summary = document.querySelector(".summary");
const teacherOnly = document.querySelector(".teacher-only");
const settingsLink = document.querySelector(".settings-link");
const listSelect = document.querySelector(".list-select");
const roundsValue = document.querySelector(".rounds-value");
const levelValue = document.querySelector(".level-value");
const levelNote = document.querySelector(".level-note");

playButton.addEventListener("click", startGame);
playAgainButton.addEventListener("click", startGame);
menuButton.addEventListener("click", () => showScreen("start"));
nextButton.addEventListener("click", goToNext);

// ---------- small helpers ----------
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function showScreen(name) {
    for (const [key, element] of Object.entries(screens)) {
        element.hidden = (key !== name);
    }
}

function restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
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

// "a book" and "the book" -> "book"; "to school" -> "school"; "for you" -> "you"
function nounOf(text) {
    return text.toLowerCase().replace(/^((to|in|for|on|at)\s+)?((a|an|the)\s+)?/, "");
}

// Turns an alsoValid entry into a "left|right" key.
// "walk a dog" -> "walk|dog";  "cold|small" is used as it is
function keyFromText(text) {
    if (text.includes("|")) {
        const [left, right] = text.split("|");
        return left.trim().toLowerCase() + "|" + right.trim().toLowerCase();
    }
    const [verb, ...rest] = text.split(" ");
    return verb.toLowerCase() + "|" + nounOf(rest.join(" "));
}

// ---------- speech ----------
function speak(text, interrupt = true) {
    if (interrupt) speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.7;
    speechSynthesis.speak(utterance);
}

// says what a card says when tapped (some cards are deliberately silent)
function sayCard(card) {
    if (card.dataset.speak) speak(card.dataset.speak);
}

// ---------- settings in the URL ----------
function readSettingsFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const rounds = parseInt(params.get("rounds"), 10);
    const level = parseInt(params.get("level"), 10);
    return {
        hasSettings: params.has("list"),
        listId: params.get("list"),
        rounds: clamp(rounds || 10, MIN_ROUNDS, MAX_ROUNDS),
        level: LEVELS[level] ? level : 3
    };
}

function buildShareUrl() {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({
        list: state.settings.listId,
        rounds: state.settings.rounds,
        level: state.settings.level
    });
    return base + "?" + params.toString();
}

// ---------- loading data ----------
async function loadActivities() {
    const response = await fetch("activities/index.json");
    if (!response.ok) {
        throw new Error("HTTP error " + response.status);
    }
    const data = await response.json();
    return data.activities;
}

async function loadList(listId) {
    playButton.disabled = true;
    const entry = state.activities.find(a => a.id === listId);
    if (!entry) {
        throw new Error("Unknown word list: " + listId);
    }
    const response = await fetch(entry.filepath);
    if (!response.ok) {
        throw new Error("HTTP error " + response.status);
    }
    const data = await response.json();
    state.settings.listId = listId;
    state.title = data.title;
    state.items = prepareItems(data);
    state.alsoValid = new Set((data.alsoValid ?? []).map(keyFromText));
    playButton.disabled = false;
}

// Every item ends up in the same shape, whatever type of list it came from
function makeItem(id, f) {
    return {
        id: id,
        left: f.left,
        right: f.right,
        leftKey: f.leftKey ?? f.left.toLowerCase(),     // used to spot clashes
        rightKey: f.rightKey ?? f.right.toLowerCase(),
        speakLeft: f.speakLeft ?? f.left,               // what each card says when tapped
        speakRight: f.speakRight ?? f.right,            // ("" means silent)
        whole: f.whole ?? (f.left + " " + f.right),     // said when the pair is matched
        emoji: f.emoji ?? null,
        ja: f.ja ?? null,
        rightIsPicture: f.rightIsPicture ?? false,
        lastUsed: null,
        timesShown: 0
    };
}

function itemFromPhrase(p, index) {
    const object = p.en.slice(p.verb.length).trim();
    if (object === "") return null;                     // e.g. "run" has nothing to match
    return makeItem(index, {
        left: p.verb,
        right: object,
        leftKey: p.verb.toLowerCase(),
        rightKey: nounOf(object),
        whole: p.en,
        emoji: p.emoji,
        ja: p.ja
    });
}

function prepareItems(data) {
    const type = data.type ?? "phrases";

    if (type === "phrases") {
        return data.phrases
            .map(itemFromPhrase)
            .filter(item => item !== null);
    }

    return data.items.map((entry, index) => {
        if (type === "pairs") {
            return makeItem(index, {
                left: entry.left,
                right: entry.right,
                whole: entry.left + ", " + entry.right,
                emoji: entry.emoji,
                ja: entry.ja
            });
        }
        if (type === "pictures") {
            return makeItem(index, {
                left: entry.word,
                right: entry.emoji,
                speakRight: "",                          // silent, or it would give the answer away
                whole: entry.word,
                ja: entry.ja,
                rightIsPicture: true
            });
        }
        if (type === "translation") {
            return makeItem(index, {
                left: entry.en,
                right: entry.ja,
                speakRight: "",
                whole: entry.en,
                emoji: entry.emoji
            });
        }
        throw new Error("Unknown list type: " + type);
    });
}

// ---------- building a round ----------
// Two items clash if the left of one could also fit the right of the other
function conflicts(a, b) {
    return a.leftKey === b.leftKey
        || a.rightKey === b.rightKey
        || state.alsoValid.has(a.leftKey + "|" + b.rightKey)
        || state.alsoValid.has(b.leftKey + "|" + a.rightKey);
}

function pickRound() {
    const { pairs, cooldown } = LEVELS[state.settings.level];
    const round = [];

    function addFrom(candidates) {
        for (const item of candidates) {
            if (round.length === pairs) return;
            if (round.some(other => conflicts(other, item))) continue;
            round.push(item);
        }
    }

    const eligible = state.items.filter(
        item => item.lastUsed === null || state.round - item.lastUsed > cooldown
    );
    addFrom(shuffle(eligible.filter(item => item.timesShown === 0)));
    addFrom(shuffle(eligible.filter(item => item.timesShown > 0)));

    // small word list: borrow the least recently used (still avoiding clashes,
    // so a very small list can give a round with fewer pairs)
    if (round.length < pairs) {
        const others = state.items.filter(item => !round.includes(item));
        addFrom(others.sort((a, b) => (a.lastUsed ?? 0) - (b.lastUsed ?? 0)));
    }

    for (const item of round) {
        item.lastUsed = state.round;
        item.timesShown += 1;
    }
    return round;
}

function makeCard(item, side) {
    const card = document.createElement("button");
    card.className = "card " + side;
    card.dataset.pairId = item.id;
    card.dataset.side = side;
    card.dataset.key = side === "left" ? item.leftKey : item.rightKey;
    card.dataset.speak = side === "left" ? item.speakLeft : item.speakRight;
    card.dataset.whole = item.whole;

    const isPicture = side === "right" && item.rightIsPicture;
    if (isPicture) card.classList.add("picture-card");

    if (side === "right" && item.emoji && !isPicture) {
        const picture = document.createElement("span");
        picture.className = "picture";
        picture.textContent = item.emoji;
        card.append(picture);
    }

    const text = document.createElement("span");
    text.className = "text";

    const label = document.createElement("span");
    label.className = "word";
    label.textContent = side === "left" ? item.left : item.right;
    text.append(label);

    if (item.ja) {
        const hint = document.createElement("span");
        hint.className = "hint";
        hint.textContent = item.ja;
        text.append(hint);
    }

    card.append(text);
    card.addEventListener("click", handleCardClick);
    return card;
}

function startGame() {
    clearTimeout(state.roundTimer);
    clearTimeout(state.nextTimer);
    clearInterval(state.transferTimer);
    state.score = 0;
    state.roundScore = 0;
    state.maxScore = 0;
    state.round = 0;
    for (const item of state.items) {
        item.lastUsed = null;
        item.timesShown = 0;
    }
    document.querySelector(".total-rounds").textContent = state.settings.rounds;
    showScreen("game");
    startRound();
}

function startRound() {
    bankRoundScore();
    clearTimeout(state.nextTimer);
    nextButton.classList.remove("counting");
    nextButton.hidden = true;

    state.round += 1;
    state.selected = null;
    state.colourIndex = 0;
    state.streak = 0;
    state.missesInARow = 0;
    state.roundHadMistake = false;

    const round = pickRound();
    state.pairsLeft = round.length;
    state.maxScore += maxRoundScore(round.length);
    document.querySelector(".round").textContent = state.round;

    const lefts = shuffle(round);
    const rights = shuffle(round);
    board.replaceChildren();
    for (let i = 0; i < round.length; i++) {
        board.append(makeCard(lefts[i], "left"), makeCard(rights[i], "right"));
    }

    startTimer(round.length);
}

function finishGame() {
    bankRoundScore();
    const ratio = state.score / state.maxScore;
    let message = "Nice try! もういちどやってみよう！";
    if (ratio >= 0.8) {
        message = "Amazing! すごい！";
    } else if (ratio >= 0.5) {
        message = "Good job! よくできました！";
    }
    document.querySelector(".end-message").textContent = message;
    document.querySelector(".final-score").textContent = state.score + " / " + state.maxScore;
    showScreen("end");
}

// ---------- the timer (last third of the rounds) ----------
function isTimedRound() {
    const timedRounds = Math.ceil(state.settings.rounds / 3);
    return state.round > state.settings.rounds - timedRounds;
}

function startTimer(pairCount) {
    clearTimeout(state.roundTimer);
    timerBar.hidden = !isTimedRound();
    if (!isTimedRound()) return;

    const seconds = pairCount * SECONDS_PER_PAIR;
    timerFill.style.animationDuration = seconds + "s";
    timerFill.style.animationPlayState = "running";
    restartAnimation(timerFill, "run");
    state.roundTimer = setTimeout(handleTimeUp, seconds * 1000);
}

function stopTimer() {
    clearTimeout(state.roundTimer);
    timerFill.style.animationPlayState = "paused";
}

function handleTimeUp() {
    for (const card of board.querySelectorAll(".card:not(:disabled)")) {
        card.disabled = true;
        card.classList.remove("selected");
        card.classList.add("timeup", "show-hint");
    }
    state.selected = null;
    state.roundHadMistake = true;
    showFeedback(false);
    endRound(3000);
}

// ---------- playing ----------
function select(card) {
    state.selected = card;
    card.classList.add("selected");
    sayCard(card);
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

function lockPair(first, second) {
    const colour = PALETTE[state.colourIndex % PALETTE.length];
    state.colourIndex += 1;

    for (const card of [first, second]) {
        card.classList.remove("selected");
        card.classList.add("matched");
        card.style.setProperty("--pair-colour", colour);
        card.disabled = true;
    }
    setTimeout(() => {
        first.classList.add("gone");
        second.classList.add("gone");
    }, 700);
}

function pointsForMatch(streak) {
    return streak % 3 === 0 ? 2 : 1;
}

function maxRoundScore(pairCount) {
    let total = PERFECT_ROUND_BONUS;
    for (let i = 1; i < pairCount; i++) {
        total += pointsForMatch(i);
    }
    return total;
}

// ---------- scores ----------
function drawScore() {
    document.querySelector(".round-score").textContent = state.roundScore;
    document.querySelector(".score").textContent = state.score;
}

function addPoints(points) {
    state.roundScore += points;
    drawScore();
    restartAnimation(roundScoreBox, "pop");
}

function bankRoundScore() {
    clearInterval(state.transferTimer);
    state.score += state.roundScore;
    state.roundScore = 0;
    drawScore();
}

function transferScore() {
    clearInterval(state.transferTimer);
    state.transferTimer = setInterval(() => {
        if (state.roundScore <= 0) {
            clearInterval(state.transferTimer);
            restartAnimation(totalScoreBox, "pop");
            return;
        }
        state.roundScore -= 1;
        state.score += 1;
        drawScore();
    }, 80);
}

function handleMatch(first, second) {
    state.streak += 1;
    state.pairsLeft -= 1;
    const points = pointsForMatch(state.streak);

    lockPair(first, second);
    state.selected = null;
    state.missesInARow = 0;
    addPoints(points);
    showFeedback(true, points);
    speak(first.dataset.whole);

    if (state.pairsLeft === 1) {
        stopTimer();
        autoCompleteLastPair();
    }
}

function autoCompleteLastPair() {
    const [first, second] = board.querySelectorAll(".card:not(:disabled)");
    first.disabled = true;
    second.disabled = true;

    setTimeout(() => {
        lockPair(first, second);
        speak(first.dataset.whole, false);
        if (!state.roundHadMistake) {
            addPoints(PERFECT_ROUND_BONUS);
            showFeedback(true, PERFECT_ROUND_BONUS);
        }
        endRound(1800);
    }, 900);
}

// ---------- between rounds ----------
function endRound(delay) {
    setTimeout(showRoundSummary, delay);
}

function showRoundSummary() {
    const panel = document.createElement("div");
    panel.className = "round-summary";

    const heading = document.createElement("p");
    heading.className = "summary-heading";
    heading.textContent = "Round " + state.round + " complete!";

    const points = document.createElement("p");
    points.className = "summary-points";
    points.textContent = "+" + state.roundScore;

    panel.append(heading, points);
    board.replaceChildren(panel);

    setTimeout(transferScore, 900);

    const isLastRound = state.round >= state.settings.rounds;
    nextButton.textContent = isLastRound ? "See results ★" : "Next round ▶";
    nextButton.hidden = false;
    if (!isLastRound) {
        nextButton.style.setProperty("--countdown", NEXT_ROUND_SECONDS + "s");
        restartAnimation(nextButton, "counting");
        state.nextTimer = setTimeout(goToNext, NEXT_ROUND_SECONDS * 1000);
    }
}

function goToNext() {
    clearTimeout(state.nextTimer);
    nextButton.classList.remove("counting");
    if (state.round >= state.settings.rounds) {
        finishGame();
    } else {
        startRound();
    }
}

// ---------- misses ----------
// true if this pair makes sense but isn't one of this activity's pairs
function isPlausibleAlternative(a, b) {
    const leftCard = a.dataset.side === "left" ? a : b;
    const rightCard = a.dataset.side === "left" ? b : a;
    const key = leftCard.dataset.key + "|" + rightCard.dataset.key;
    return state.alsoValid.has(key)
        || state.alsoValid.has(leftCard.dataset.key + "|*");
}

function handleMiss(card) {
    const first = state.selected;
    deselect();
    sayCard(card);

    if (isPlausibleAlternative(first, card)) {
        showToast(NEAR_MISS_MESSAGE);
        for (const c of [first, card]) c.classList.add("near");
        setTimeout(() => {
            for (const c of [first, card]) c.classList.remove("near");
        }, 600);
        return;
    }

    state.streak = 0;
    state.missesInARow += 1;
    state.roundHadMistake = true;
    showFeedback(false);

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

function showFeedback(isCorrect, points = 0) {
    feedback.classList.remove("maru", "batsu");
    feedback.classList.add(isCorrect ? "maru" : "batsu");
    feedbackPoints.textContent = isCorrect ? "+" + points : "";
    restartAnimation(feedback, "show");
}

function showToast(message) {
    toast.textContent = message;
    restartAnimation(toast, "show");
}

// ---------- setup screen ----------
let qrCode = null;

function drawQrCode() {
    if (typeof QRCode === "undefined") return;
    const url = buildShareUrl();
    if (qrCode === null) {
        qrCode = new QRCode(document.querySelector(".qr-code"), { text: url, width: 320, height: 320 });
    } else {
        qrCode.makeCode(url);
    }
}

function drawSettings() {
    titleElement.textContent = teacherOnly.hidden ? state.title : "Word List";
    roundsValue.textContent = state.settings.rounds;
    levelValue.textContent = state.settings.level;
    levelNote.textContent = LEVELS[state.settings.level].label;
    summary.textContent = state.settings.rounds + " rounds · Level " + state.settings.level;
    if (!teacherOnly.hidden) drawQrCode();
}

function changeSetting(setting, change) {
    if (setting === "rounds") {
        state.settings.rounds = clamp(state.settings.rounds + change, MIN_ROUNDS, MAX_ROUNDS);
    } else if (setting === "level") {
        state.settings.level = clamp(state.settings.level + change, 1, 3);
    }
    drawSettings();
}

function wireControls() {
    for (const activity of state.activities) {
        const option = document.createElement("option");
        option.value = activity.id;
        option.textContent = activity.name;
        listSelect.append(option);
    }
    listSelect.value = state.settings.listId;
    listSelect.addEventListener("change", async () => {
        await loadList(listSelect.value);
        drawSettings();
    });

    document.querySelectorAll(".step-button").forEach(button => {
        button.addEventListener("click", () => {
            changeSetting(button.dataset.setting, Number(button.dataset.change));
        });
    });
}

// ---------- start ----------
async function init() {
    try {
        state.activities = await loadActivities();
        const fromUrl = readSettingsFromUrl();
        state.settings.rounds = fromUrl.rounds;
        state.settings.level = fromUrl.level;

        const known = state.activities.some(a => a.id === fromUrl.listId);
        await loadList(known ? fromUrl.listId : state.activities[0].id);

        const teacherMode = !fromUrl.hasSettings;
        teacherOnly.hidden = !teacherMode;
        summary.hidden = teacherMode;
        settingsLink.hidden = teacherMode;
        if (teacherMode) wireControls();
        drawSettings();
    } catch (error) {
        console.error(error);
        titleElement.textContent = "Couldn't load the activity";
    }
}

init();