const speechButton = document.querySelectorAll(".speech");

speechButton.forEach((button) => {
    button.addEventListener("click", speakWord);
});

function speakWord(e) {
    const utterance = new SpeechSynthesisUtterance(e.target.textContent);
    utterance.lang = "en-GB";
    utterance.rate = 0.7;
    speechSynthesis.speak(utterance);
}

async function loadPhrases() {
    const response = await fetch("activities/s1p2_basicdialogs.json");
    if (!response.ok) {
        throw new Error("HTTP error" + response.status);
    }
    const data = await response.json();
    return data.phrases;
}

async function init() {
    const phrases = await loadPhrases();
    const grid = document.querySelector(".phrase-grid");

    phrases.forEach((phrase) => {
        const button = document.createElement("button");
        button.className = "speech";
        button.textContent = phrase.en;
        button.addEventListener("click", speakWord);
        grid.append(button);
    });
}

init();