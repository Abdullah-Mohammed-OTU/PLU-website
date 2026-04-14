"""Functional tests using Flask's test client. Exercises the HTTP layer end-to-end."""
from __future__ import annotations

from io import BytesIO

from PIL import Image


class TestIndex:
    def test_index_returns_html(self, client):
        res = client.get("/")
        assert res.status_code == 200
        assert b"Produce PLU Voice Lookup" in res.data
        assert b"mic-btn" in res.data

    def test_index_includes_item_count(self, client):
        res = client.get("/")
        assert res.status_code == 200
        assert b"items in database" in res.data


class TestLookupAPI:
    def test_lookup_banana(self, client):
        res = client.get("/api/lookup?q=banana")
        assert res.status_code == 200
        body = res.get_json()
        assert body["match"]["plu"] == "4011"
        assert body["match"]["unit"] == "KG"
        assert isinstance(body["alternatives"], list)

    def test_lookup_drumstick_handwritten(self, client):
        res = client.get("/api/lookup?q=drumstick")
        body = res.get_json()
        assert body["match"]["plu"] == "7997"

    def test_lookup_echoes_query(self, client):
        res = client.get("/api/lookup?q=gala+apples")
        body = res.get_json()
        assert body["query"] == "gala apples"

    def test_lookup_empty_query(self, client):
        res = client.get("/api/lookup?q=")
        body = res.get_json()
        assert body["match"] is None
        assert body["alternatives"] == []

    def test_lookup_missing_query_param(self, client):
        res = client.get("/api/lookup")
        assert res.status_code == 200
        body = res.get_json()
        assert body["match"] is None

    def test_lookup_gibberish(self, client):
        res = client.get("/api/lookup?q=zzqqxxvv99")
        body = res.get_json()
        if body["match"]:
            assert body["match"]["score"] < 0.7

    def test_lookup_returns_alternatives_when_ambiguous(self, client):
        res = client.get("/api/lookup?q=apple")
        body = res.get_json()
        assert body["match"] is not None
        assert len(body["alternatives"]) >= 1


class TestBarcodeAPI:
    def test_valid_plu_returns_png(self, client):
        res = client.get("/api/barcode/4011.png")
        assert res.status_code == 200
        assert res.mimetype == "image/png"
        img = Image.open(BytesIO(res.data))
        assert img.format == "PNG"
        assert img.width > 100 and img.height > 50

    def test_five_digit_plu_works(self, client):
        res = client.get("/api/barcode/94011.png")
        assert res.status_code == 200
        assert res.mimetype == "image/png"

    def test_non_numeric_plu_rejected(self, client):
        res = client.get("/api/barcode/abcd.png")
        assert res.status_code == 400

    def test_too_short_plu_rejected(self, client):
        res = client.get("/api/barcode/12.png")
        assert res.status_code == 400

    def test_too_long_plu_rejected(self, client):
        res = client.get("/api/barcode/1234567.png")
        assert res.status_code == 400


class TestAllAPI:
    def test_returns_full_list(self, client):
        res = client.get("/api/all")
        assert res.status_code == 200
        body = res.get_json()
        assert isinstance(body, list)
        assert any(e["plu"] == "4011" for e in body)
        assert any(e["plu"] == "7997" for e in body)
