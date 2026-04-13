"use strict";
const qs = (sel) => {
    const el = document.querySelector(sel);
    if (!el)
        throw new Error(`Missing element: ${sel}`);
    return el;
};
const micBtn = qs("#mic-btn");
const micLabel = qs("#mic-label");
const statusEl = qs("#status");
const textForm = qs("#text-form");
const textInput = qs("#text-input");
const resultCard = qs("#result-card");
const noMatch = qs("#no-match");
const heard = qs("#heard");
const produceName = qs("#produce-name");
const pluCode = qs("#plu-code");
const unitBadge = qs("#unit-badge");
const barcodeImg = qs("#barcode-img");
const altWrap = qs("#alternatives-wrap");
const altList = qs("#alternatives");
const setStatus = (msg) => { statusEl.textContent = msg; };
async function lookup(query) {
    const trimmed = query.trim();
    if (!trimmed)
        return;
    heard.textContent = trimmed;
    setStatus(`Looking up "${trimmed}"…`);
    try {
        const res = await fetch(`/api/lookup?q=${encodeURIComponent(trimmed)}`);
        const data = (await res.json());
        renderResult(data);
    }
    catch (err) {
        setStatus(`Error: ${err.message}`);
    }
}
function renderResult(data) {
    if (!data.match) {
        resultCard.classList.add("hidden");
        noMatch.classList.remove("hidden");
        setStatus("No match found.");
        return;
    }
    noMatch.classList.add("hidden");
    resultCard.classList.remove("hidden");
    const m = data.match;
    produceName.textContent = m.name;
    pluCode.textContent = m.plu;
    unitBadge.textContent = m.unit === "KG" ? "SOLD BY KG" : "SOLD BY EACH";
    barcodeImg.src = `/api/barcode/${m.plu}.png?t=${Date.now()}`;
    barcodeImg.alt = `Code 128 barcode for PLU ${m.plu} — ${m.name}`;
    altList.innerHTML = "";
    if (data.alternatives.length > 0) {
        altWrap.classList.remove("hidden");
        for (const alt of data.alternatives) {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "alt-chip";
            chip.textContent = `${alt.name} (${alt.plu})`;
            chip.addEventListener("click", () => lookup(alt.name));
            altList.appendChild(chip);
        }
    }
    else {
        altWrap.classList.add("hidden");
    }
    setStatus(`Match: ${m.name} — PLU ${m.plu}`);
}
textForm.addEventListener("submit", (e) => {
    e.preventDefault();
    lookup(textInput.value);
});
const w = window;
const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
if (!SR) {
    micBtn.disabled = true;
    micBtn.classList.add("opacity-50", "cursor-not-allowed");
    micLabel.textContent = "Voice not supported";
    setStatus("This browser does not support the Web Speech API. Try Chrome, Edge, or Safari on desktop.");
}
else {
    const recognition = new SR();
    recognition.lang = "en-CA";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    let listening = false;
    const stopUI = () => {
        listening = false;
        micBtn.classList.remove("listening");
        micLabel.textContent = "Start listening";
    };
    recognition.onstart = () => {
        listening = true;
        micBtn.classList.add("listening");
        micLabel.textContent = "Listening… speak now";
        setStatus("Listening…");
    };
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        textInput.value = transcript;
        lookup(transcript);
    };
    recognition.onerror = (event) => {
        const err = event.error || "unknown";
        setStatus(`Microphone error: ${err}. Check browser permissions.`);
        stopUI();
    };
    recognition.onend = () => { stopUI(); };
    micBtn.addEventListener("click", () => {
        if (listening) {
            recognition.stop();
            return;
        }
        try {
            recognition.start();
        }
        catch (err) {
            setStatus(`Could not start: ${err.message}`);
        }
    });
}
//# sourceMappingURL=app.js.map