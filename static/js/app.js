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
let currentMatch = null;
async function lookup(query) {
    const trimmed = query.trim();
    if (!trimmed)
        return null;
    heard.textContent = trimmed;
    setStatus(`Looking up "${trimmed}"…`);
    try {
        const res = await fetch(`/api/lookup?q=${encodeURIComponent(trimmed)}`);
        const data = (await res.json());
        return renderResult(data);
    }
    catch (err) {
        setStatus(`Error: ${err.message}`);
        return null;
    }
}
function renderResult(data) {
    if (!data.match) {
        resultCard.classList.add("hidden");
        noMatch.classList.remove("hidden");
        setStatus("No match found.");
        currentMatch = null;
        return null;
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
    currentMatch = m;
    return m;
}
function clearResult() {
    resultCard.classList.add("hidden");
    noMatch.classList.add("hidden");
    currentMatch = null;
    heard.textContent = "";
}
// ------------------ Speech synthesis ------------------
function speak(text) {
    return new Promise((resolve) => {
        if (!("speechSynthesis" in window)) {
            resolve();
            return;
        }
        try {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = "en-CA";
            u.rate = 1.0;
            u.onend = () => resolve();
            u.onerror = () => resolve();
            speechSynthesis.speak(u);
            setTimeout(() => resolve(), 6000);
        }
        catch {
            resolve();
        }
    });
}
function speakMatch(m) {
    const digits = m.plu.split("").join(" ");
    const unit = m.unit === "KG" ? "sold by kilogram" : "sold by each";
    return speak(`${m.name}. PLU ${digits}. ${unit}.`);
}
// ------------------ Wake Lock ------------------
let wakeLock = null;
async function acquireWakeLock() {
    const nav = navigator;
    if (!nav.wakeLock)
        return;
    try {
        wakeLock = await nav.wakeLock.request("screen");
    }
    catch { /* ignore */ }
}
async function releaseWakeLock() {
    if (wakeLock) {
        try {
            await wakeLock.release();
        }
        catch { /* ignore */ }
        wakeLock = null;
    }
}
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && handsFree)
        acquireWakeLock();
});
// ------------------ Hands-free recognition loop ------------------
const w = window;
const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
let recognition = null;
let handsFree = false; // true = user wants continuous listening
let speaking = false; // suppresses restart while TTS is talking
let restartTimer = null;
function setMicUI(state) {
    micBtn.classList.toggle("listening", state === "listening");
    micBtn.classList.toggle("speaking", state === "speaking");
    micBtn.classList.toggle("paused", state === "paused");
    switch (state) {
        case "idle":
            micLabel.textContent = "Start hands-free";
            break;
        case "listening":
            micLabel.textContent = "Listening… tap to stop";
            break;
        case "speaking":
            micLabel.textContent = "Speaking…";
            break;
        case "paused":
            micLabel.textContent = "Paused — tap to resume";
            break;
    }
}
function scheduleRestart(delay = 250) {
    if (restartTimer !== null)
        window.clearTimeout(restartTimer);
    restartTimer = window.setTimeout(() => {
        restartTimer = null;
        if (handsFree && !speaking && recognition) {
            try {
                recognition.start();
            }
            catch { /* already started; ignore */ }
        }
    }, delay);
}
async function handleTranscript(transcript) {
    textInput.value = transcript;
    const t = transcript.toLowerCase().trim();
    // Voice commands
    if (/^(stop|stop listening|pause|quiet)\b/.test(t)) {
        handsFree = false;
        if (recognition) {
            try {
                recognition.abort();
            }
            catch { /* */ }
        }
        setMicUI("paused");
        setStatus("Paused. Tap the button to resume.");
        releaseWakeLock();
        return;
    }
    if (/^(clear|reset)\b/.test(t)) {
        clearResult();
        setStatus("Cleared. Say a produce name.");
        return;
    }
    if (/^(repeat|say again|again)\b/.test(t)) {
        if (currentMatch) {
            speaking = true;
            setMicUI("speaking");
            await speakMatch(currentMatch);
            speaking = false;
            if (handsFree) {
                setMicUI("listening");
                scheduleRestart();
            }
        }
        return;
    }
    const m = await lookup(transcript);
    if (m) {
        speaking = true;
        setMicUI("speaking");
        await speakMatch(m);
        speaking = false;
    }
    else {
        speaking = true;
        setMicUI("speaking");
        await speak("No match. Try again.");
        speaking = false;
    }
    if (handsFree) {
        setMicUI("listening");
        scheduleRestart();
    }
}
async function startHandsFree() {
    if (!SR)
        return;
    if (!recognition) {
        recognition = new SR();
        recognition.lang = "en-CA";
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;
        recognition.onstart = () => { if (handsFree && !speaking)
            setMicUI("listening"); };
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            handleTranscript(transcript);
        };
        recognition.onerror = (event) => {
            const err = event.error || "unknown";
            if (err === "no-speech" || err === "aborted") {
                scheduleRestart(300);
                return;
            }
            setStatus(`Microphone error: ${err}.`);
            handsFree = false;
            setMicUI("idle");
            releaseWakeLock();
        };
        recognition.onend = () => {
            if (handsFree && !speaking)
                scheduleRestart(250);
            else if (!handsFree)
                setMicUI("paused");
        };
    }
    handsFree = true;
    await acquireWakeLock();
    await speak("Listening.");
    setMicUI("listening");
    setStatus("Listening…");
    scheduleRestart(100);
}
function stopHandsFree() {
    handsFree = false;
    if (restartTimer !== null) {
        window.clearTimeout(restartTimer);
        restartTimer = null;
    }
    if (recognition) {
        try {
            recognition.abort();
        }
        catch { /* */ }
    }
    if ("speechSynthesis" in window)
        speechSynthesis.cancel();
    speaking = false;
    setMicUI("idle");
    setStatus("");
    releaseWakeLock();
}
// ------------------ Wiring ------------------
textForm.addEventListener("submit", (e) => {
    e.preventDefault();
    lookup(textInput.value);
});
if (!SR) {
    micBtn.disabled = true;
    micBtn.classList.add("opacity-50", "cursor-not-allowed");
    micLabel.textContent = "Voice not supported";
    setStatus("This browser does not support the Web Speech API. Try Chrome, Edge, or Safari.");
}
else {
    setMicUI("idle");
    micBtn.addEventListener("click", () => {
        if (handsFree) {
            stopHandsFree();
            return;
        }
        startHandsFree();
    });
}
//# sourceMappingURL=app.js.map