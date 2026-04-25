interface PLUEntry {
  plu: string;
  name: string;
  unit: "KG" | "EA";
  aliases?: string[];
  score?: number;
}

interface LookupResponse {
  query: string;
  match: PLUEntry | null;
  alternatives: PLUEntry[];
}

interface SpeechRecognitionEventLike extends Event {
  results: {
    [index: number]: { [index: number]: { transcript: string } };
    length: number;
  };
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: (ev: SpeechRecognitionEventLike) => void;
  onerror: (ev: Event & { error?: string }) => void;
  onend: () => void;
  onstart: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => Recognition;

type WakeLockSentinelLike = { release: () => Promise<void> };

const qs = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector(sel) as T | null;
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

const micBtn       = qs<HTMLButtonElement>("#mic-btn");
const micLabel     = qs<HTMLSpanElement>("#mic-label");
const statusEl     = qs<HTMLParagraphElement>("#status");
const textForm     = qs<HTMLFormElement>("#text-form");
const textInput    = qs<HTMLInputElement>("#text-input");
const resultCard   = qs<HTMLElement>("#result-card");
const noMatch      = qs<HTMLElement>("#no-match");
const heard        = qs<HTMLParagraphElement>("#heard");
const produceName  = qs<HTMLParagraphElement>("#produce-name");
const pluCode      = qs<HTMLParagraphElement>("#plu-code");
const unitBadge    = qs<HTMLSpanElement>("#unit-badge");
const barcodeImg   = qs<HTMLImageElement>("#barcode-img");
const altWrap      = qs<HTMLElement>("#alternatives-wrap");
const altList      = qs<HTMLDivElement>("#alternatives");

const setStatus = (msg: string): void => { statusEl.textContent = msg; };

let currentMatch: PLUEntry | null = null;

async function lookup(query: string): Promise<PLUEntry | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  heard.textContent = trimmed;
  setStatus(`Looking up "${trimmed}"…`);

  try {
    const res = await fetch(`/api/lookup?q=${encodeURIComponent(trimmed)}`);
    const data = (await res.json()) as LookupResponse;
    return renderResult(data);
  } catch (err) {
    setStatus(`Error: ${(err as Error).message}`);
    return null;
  }
}

function renderResult(data: LookupResponse): PLUEntry | null {
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
  } else {
    altWrap.classList.add("hidden");
  }

  setStatus(`Match: ${m.name} — PLU ${m.plu}`);
  currentMatch = m;
  return m;
}

function clearResult(): void {
  resultCard.classList.add("hidden");
  noMatch.classList.add("hidden");
  currentMatch = null;
  heard.textContent = "";
}

// ------------------ Speech synthesis ------------------

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) { resolve(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-CA";
      u.rate = 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
      setTimeout(() => resolve(), 6000);
    } catch { resolve(); }
  });
}

function speakMatch(m: PLUEntry): Promise<void> {
  const digits = m.plu.split("").join(" ");
  const unit = m.unit === "KG" ? "sold by kilogram" : "sold by each";
  return speak(`${m.name}. PLU ${digits}. ${unit}.`);
}

// ------------------ Wake Lock ------------------

let wakeLock: WakeLockSentinelLike | null = null;

async function acquireWakeLock(): Promise<void> {
  const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<WakeLockSentinelLike> } };
  if (!nav.wakeLock) return;
  try { wakeLock = await nav.wakeLock.request("screen"); }
  catch { /* ignore */ }
}
async function releaseWakeLock(): Promise<void> {
  if (wakeLock) { try { await wakeLock.release(); } catch { /* ignore */ } wakeLock = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && handsFree) acquireWakeLock();
});

// ------------------ Hands-free recognition loop ------------------

const w = window as unknown as {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};
const SR = w.SpeechRecognition || w.webkitSpeechRecognition;

let recognition: Recognition | null = null;
let handsFree = false;    // true = user wants continuous listening
let speaking = false;     // suppresses restart while TTS is talking
let processingTranscript = false;
let restartTimer: number | null = null;

function setMicUI(state: "idle" | "listening" | "speaking" | "paused"): void {
  micBtn.classList.toggle("listening", state === "listening");
  micBtn.classList.toggle("speaking", state === "speaking");
  micBtn.classList.toggle("paused", state === "paused");
  switch (state) {
    case "idle":      micLabel.textContent = "Start hands-free"; break;
    case "listening": micLabel.textContent = "Listening… tap to stop"; break;
    case "speaking":  micLabel.textContent = "Speaking…"; break;
    case "paused":    micLabel.textContent = "Paused — tap to resume"; break;
  }
}

function scheduleRestart(delay = 250): void {
  if (restartTimer !== null) window.clearTimeout(restartTimer);
  restartTimer = window.setTimeout(() => {
    restartTimer = null;
    if (handsFree && !speaking && recognition) {
      try { recognition.start(); } catch { /* already started; ignore */ }
    }
  }, delay);
}

async function handleTranscript(transcript: string): Promise<void> {
  processingTranscript = true;
  try {
    textInput.value = transcript;
    const t = transcript.toLowerCase().trim();

    // Voice commands
    if (/^(stop|stop listening|pause|quiet)\b/.test(t)) {
      handsFree = false;
      if (recognition) { try { recognition.abort(); } catch { /* */ } }
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
      }
      return;
    }

    const m = await lookup(transcript);
    if (m) {
      speaking = true;
      setMicUI("speaking");
      await speakMatch(m);
      speaking = false;
    } else {
      speaking = true;
      setMicUI("speaking");
      await speak("No match. Try again.");
      speaking = false;
    }
  } finally {
    processingTranscript = false;
    if (handsFree && !speaking) { setMicUI("listening"); scheduleRestart(); }
  }
}

async function startHandsFree(): Promise<void> {
  if (!SR) return;
  if (!recognition) {
    recognition = new SR();
    recognition.lang = "en-CA";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { if (handsFree && !speaking) setMicUI("listening"); };
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
      if (handsFree && !speaking && !processingTranscript) scheduleRestart(250);
      else if (!handsFree) setMicUI("paused");
    };
  }

  handsFree = true;
  await acquireWakeLock();
  await speak("Listening.");
  setMicUI("listening");
  setStatus("Listening…");
  scheduleRestart(100);
}

function stopHandsFree(): void {
  handsFree = false;
  if (restartTimer !== null) { window.clearTimeout(restartTimer); restartTimer = null; }
  if (recognition) { try { recognition.abort(); } catch { /* */ } }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  speaking = false;
  setMicUI("idle");
  setStatus("");
  releaseWakeLock();
}

// ------------------ Wiring ------------------

textForm.addEventListener("submit", (e: Event) => {
  e.preventDefault();
  lookup(textInput.value);
});

if (!SR) {
  micBtn.disabled = true;
  micBtn.classList.add("opacity-50", "cursor-not-allowed");
  micLabel.textContent = "Voice not supported";
  setStatus("This browser does not support the Web Speech API. Try Chrome, Edge, or Safari.");
} else {
  setMicUI("idle");
  micBtn.addEventListener("click", () => {
    if (handsFree) { stopHandsFree(); return; }
    startHandsFree();
  });
}
