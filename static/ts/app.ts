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

type SpeechRecognitionCtor = new () => {
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
};

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

async function lookup(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  heard.textContent = trimmed;
  setStatus(`Looking up "${trimmed}"…`);

  try {
    const res = await fetch(`/api/lookup?q=${encodeURIComponent(trimmed)}`);
    const data = (await res.json()) as LookupResponse;
    renderResult(data);
  } catch (err) {
    setStatus(`Error: ${(err as Error).message}`);
  }
}

function renderResult(data: LookupResponse): void {
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
  } else {
    altWrap.classList.add("hidden");
  }

  setStatus(`Match: ${m.name} — PLU ${m.plu}`);
}

textForm.addEventListener("submit", (e: Event) => {
  e.preventDefault();
  lookup(textInput.value);
});

const w = window as unknown as {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};
const SR = w.SpeechRecognition || w.webkitSpeechRecognition;

if (!SR) {
  micBtn.disabled = true;
  micBtn.classList.add("opacity-50", "cursor-not-allowed");
  micLabel.textContent = "Voice not supported";
  setStatus("This browser does not support the Web Speech API. Try Chrome, Edge, or Safari on desktop.");
} else {
  const recognition = new SR();
  recognition.lang = "en-CA";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let listening = false;

  const stopUI = (): void => {
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
    if (listening) { recognition.stop(); return; }
    try { recognition.start(); }
    catch (err) { setStatus(`Could not start: ${(err as Error).message}`); }
  });
}
