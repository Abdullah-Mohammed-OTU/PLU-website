"""Unit tests for pure logic in app.py and for data integrity."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import PLU_DB, _normalize, find_matches


# ----- _normalize --------------------------------------------------------

class TestNormalize:
    def test_lowercases(self):
        assert _normalize("BANANA") == "banana"

    def test_strips_punctuation(self):
        assert _normalize("apples, gala!") == "apples gala"

    def test_collapses_whitespace(self):
        assert _normalize("  red   onion\t ") == "red onion"

    def test_empty_input(self):
        assert _normalize("") == ""
        assert _normalize("   ") == ""

    def test_keeps_digits(self):
        assert _normalize("Banana 4011") == "banana 4011"


# ----- find_matches ------------------------------------------------------

class TestFindMatches:
    def test_exact_name_match(self):
        results = find_matches("Bananas")
        assert results[0]["plu"] == "4011"
        assert results[0]["name"] == "Bananas"

    def test_alias_resolves(self):
        results = find_matches("banana")
        assert results[0]["plu"] == "4011"

    def test_handwritten_drumstick_entry(self):
        """The image has a handwritten note Drumstick -> 7997."""
        results = find_matches("drumstick")
        assert results[0]["plu"] == "7997"
        assert results[0]["unit"] == "KG"

    @pytest.mark.parametrize(
        "query,expected_plu",
        [
            ("honeycrisp apples", "3283"),
            ("gala", "4173"),
            ("red delicious", "4015"),
            ("granny smith", "4135"),
            ("red onion", "4663"),
            ("yellow onions", "4093"),
            ("cilantro", "4889"),
            ("iceberg lettuce", "4061"),
            ("cucumber", "4062"),
            ("russet potatoes", "4072"),
            ("avocado", "4225"),
            ("roma tomatoes", "4087"),
            ("ube", "4961"),
            ("cassava", "4723"),
        ],
    )
    def test_common_lookups(self, query, expected_plu):
        results = find_matches(query)
        assert results, f"no match for {query!r}"
        assert results[0]["plu"] == expected_plu

    def test_empty_query_returns_empty(self):
        assert find_matches("") == []
        assert find_matches("   ") == []

    def test_gibberish_returns_weak_or_empty(self):
        results = find_matches("zzzqqqxxxvvv")
        if results:
            assert results[0]["score"] < 0.7

    def test_respects_limit(self):
        assert len(find_matches("apples", limit=3)) <= 3

    def test_results_sorted_descending_by_score(self):
        results = find_matches("apple")
        scores = [r["score"] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_match_shape(self):
        r = find_matches("banana")[0]
        assert {"plu", "name", "unit", "score"}.issubset(r.keys())
        assert r["unit"] in ("KG", "EA")


# ----- data integrity ----------------------------------------------------

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "plu_data.json"


class TestDataFile:
    def test_file_parses(self):
        with open(DATA_PATH) as f:
            data = json.load(f)
        assert isinstance(data, list)
        assert len(data) > 50

    def test_every_entry_has_required_fields(self):
        for entry in PLU_DB:
            assert {"plu", "name", "unit"}.issubset(entry.keys()), entry

    def test_every_plu_is_numeric_string(self):
        for entry in PLU_DB:
            assert entry["plu"].isdigit(), entry

    def test_every_plu_is_valid_length(self):
        for entry in PLU_DB:
            assert 3 <= len(entry["plu"]) <= 6, entry

    def test_units_are_kg_or_ea(self):
        for entry in PLU_DB:
            assert entry["unit"] in ("KG", "EA"), entry

    def test_names_are_non_empty(self):
        for entry in PLU_DB:
            assert entry["name"].strip(), entry

    def test_aliases_are_list_of_strings(self):
        for entry in PLU_DB:
            aliases = entry.get("aliases", [])
            assert isinstance(aliases, list)
            for a in aliases:
                assert isinstance(a, str) and a.strip()
