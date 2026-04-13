# Walmart Canada — Produce PLU Voice Lookup

Flask web app that listens to your voice, looks up the PLU code for a fruit or
vegetable from the Produce PLU Chart 2024 Q2 National, and renders a Code 128
barcode that Walmart Canada register scanners can read.

## Stack
- **Backend**: Flask + `python-barcode` (Code 128 PNG generation)
- **Frontend**: Jinja2 HTML, Tailwind CSS (CDN), TypeScript compiled to ES2020 JS
- **Voice**: Web Speech API (`SpeechRecognition`), locale `en-CA`

## Run it

```bash
# 1. Python deps
pip3 install -r requirements.txt

# 2. (Re)compile TypeScript -> static/js/app.js
npx --yes -p typescript@5.4 tsc

# 3. Start server
python3 app.py
```

Then open <http://127.0.0.1:5000/> in Chrome, Edge, or desktop Safari (the Web
Speech API is required for voice; typing works everywhere).

## How it works
- `POST`/`GET /api/lookup?q=<spoken-text>` — fuzzy match against name + aliases
  in `data/plu_data.json`, returns best match + up to 4 alternatives.
- `GET /api/barcode/<plu>.png` — returns a Code 128 PNG for the PLU.
- Voice → `SpeechRecognition.onresult` → `/api/lookup` → render PLU + fetch
  `/api/barcode/<plu>.png`.

## Data
`data/plu_data.json` was transcribed from `IMG_8976.jpeg` (Produce PLU Chart
2024 Q2 National) and includes the handwritten addition **Drumstick → 7997**.
Each entry carries `plu`, `name`, `unit` (`KG`/`EA`), and search `aliases`.

## Barcode & Walmart Canada scanners
Walmart Canada front-end scanners (Datalogic Magellan / Honeywell) decode
Code 128 natively, which is the symbology used here. For any produce PLU the
same 4–5 digit code can also be keyed in manually at the POS.
