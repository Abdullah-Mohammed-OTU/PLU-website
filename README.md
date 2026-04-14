# Walmart Canada — Produce PLU Voice Lookup

Available at: https://walmartplu.duckdns.org/

Flask web app that listens to your voice, looks up the PLU code for a fruit or
vegetable from the Produce PLU Chart 2024 Q2 National, and renders a Code 128
barcode that Walmart Canada register scanners can read.

## Stack
- **Backend**: Flask + `python-barcode` (Code 128 PNG generation)
- **Frontend**: Jinja2 HTML, Tailwind CSS (CDN), TypeScript compiled to ES2020 JS
- **Voice**: Web Speech API (`SpeechRecognition`), locale `en-CA`


## How it works
- `POST`/`GET /api/lookup?q=<spoken-text>` — fuzzy match against name + aliases
  in `data/plu_data.json`, returns best match + up to 4 alternatives.
- `GET /api/barcode/<plu>.png` — returns a Code 128 PNG for the PLU.
- Voice → `SpeechRecognition.onresult` → `/api/lookup` → render PLU + fetch
  `/api/barcode/<plu>.png`.

## Data
`data/plu_data.json` was transcribed from Produce PLU Chart
2024 Q2 National. Each entry carries `plu`, `name`, `unit` (`KG`/`EA`), and search `aliases`.

## Barcode & Walmart Canada scanners
Walmart Canada front-end scanners (Datalogic Magellan / Honeywell) decode
Code 128 natively, which is the symbology used here. For any produce PLU the
same 4–5 digit code can also be keyed in manually at the POS.
