import json
import io
import re
from pathlib import Path
from difflib import SequenceMatcher

from flask import Flask, render_template, request, jsonify, send_file, abort
import barcode
from barcode.writer import ImageWriter

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "plu_data.json"

app = Flask(__name__)

with open(DATA_PATH, "r", encoding="utf-8") as f:
    PLU_DB = json.load(f)


def _normalize(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _search_terms(entry: dict) -> list[str]:
    terms = [entry["name"]] + entry.get("aliases", [])
    return [_normalize(t) for t in terms]


def find_matches(query: str, limit: int = 5) -> list[dict]:
    q = _normalize(query)
    if not q:
        return []

    q_tokens = set(q.split())
    scored: list[tuple[float, dict]] = []

    for entry in PLU_DB:
        best = 0.0
        for term in _search_terms(entry):
            if term == q:
                best = max(best, 1.0)
                continue
            t_tokens = set(term.split())
            if q_tokens and q_tokens.issubset(t_tokens):
                best = max(best, 0.95)
            if t_tokens and t_tokens.issubset(q_tokens):
                best = max(best, 0.9)
            if q in term or term in q:
                best = max(best, 0.85)
            ratio = SequenceMatcher(None, q, term).ratio()
            best = max(best, ratio)
        if best >= 0.5:
            scored.append((best, entry))

    scored.sort(key=lambda x: (-x[0], x[1]["name"]))
    results = []
    seen = set()
    for score, entry in scored:
        key = (entry["plu"], entry["name"])
        if key in seen:
            continue
        seen.add(key)
        results.append({**entry, "score": round(score, 3)})
        if len(results) >= limit:
            break
    return results


@app.route("/")
def index():
    return render_template("index.html", total_items=len(PLU_DB))


@app.route("/api/lookup")
def api_lookup():
    query = request.args.get("q", "")
    matches = find_matches(query)
    if not matches:
        return jsonify({"query": query, "match": None, "alternatives": []})
    return jsonify({
        "query": query,
        "match": matches[0],
        "alternatives": matches[1:],
    })


@app.route("/api/barcode/<plu>.png")
def api_barcode(plu: str):
    if not plu.isdigit() or not (3 <= len(plu) <= 6):
        abort(400, description="PLU must be 3-6 digits")

    code128 = barcode.get_barcode_class("code128")
    writer = ImageWriter()
    writer_options = {
        "module_width": 0.4,
        "module_height": 18.0,
        "quiet_zone": 4.0,
        "font_size": 12,
        "text_distance": 4.0,
        "write_text": True,
    }
    bc = code128(plu, writer=writer)

    buf = io.BytesIO()
    bc.write(buf, options=writer_options)
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


@app.route("/api/all")
def api_all():
    return jsonify(PLU_DB)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
