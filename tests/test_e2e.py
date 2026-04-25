"""Browser E2E tests using Playwright. Covers the typed-input flow;
the Web Speech API is not exercised because it's non-deterministic in
headless browsers and requires OS-level audio."""
from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect


@pytest.fixture(autouse=True)
def _goto_app(page: Page, live_server: str):
    page.goto(live_server)


class TestPageStructure:
    def test_title(self, page: Page):
        expect(page).to_have_title("Walmart Canada — Produce PLU Voice Lookup")

    def test_mic_button_present(self, page: Page):
        expect(page.locator("#mic-btn")).to_be_visible()

    def test_text_input_present(self, page: Page):
        expect(page.locator("#text-input")).to_be_visible()

    def test_result_card_hidden_initially(self, page: Page):
        expect(page.locator("#result-card")).to_be_hidden()


class TestTypedLookup:
    def test_banana_lookup_shows_plu(self, page: Page):
        page.locator("#text-input").fill("banana")
        page.locator("#text-form button[type=submit]").click()

        expect(page.locator("#result-card")).to_be_visible()
        expect(page.locator("#plu-code")).to_have_text("4011")
        expect(page.locator("#produce-name")).to_have_text("Bananas")
        expect(page.locator("#unit-badge")).to_contain_text("KG")

    def test_drumstick_handwritten_entry(self, page: Page):
        page.locator("#text-input").fill("drumstick")
        page.locator("#text-form button[type=submit]").click()
        expect(page.locator("#plu-code")).to_have_text("7947")

    def test_barcode_image_loads(self, page: Page):
        page.locator("#text-input").fill("banana")
        page.locator("#text-form button[type=submit]").click()

        img = page.locator("#barcode-img")
        expect(img).to_be_visible()
        expect(img).to_have_attribute("src", re.compile(r"/api/barcode/4011\.png"))

        natural_width = img.evaluate("el => el.naturalWidth")
        assert natural_width > 100, f"barcode image did not load (naturalWidth={natural_width})"

    def test_alternatives_rendered_for_ambiguous(self, page: Page):
        page.locator("#text-input").fill("apple")
        page.locator("#text-form button[type=submit]").click()
        expect(page.locator("#alternatives-wrap")).to_be_visible()
        assert page.locator("#alternatives .alt-chip").count() >= 1

    def test_clicking_alternative_reissues_lookup(self, page: Page):
        page.locator("#text-input").fill("apple")
        page.locator("#text-form button[type=submit]").click()
        expect(page.locator("#alternatives-wrap")).to_be_visible()
        first = page.locator("#alternatives .alt-chip").first
        chip_text = first.inner_text()
        first.click()
        expect(page.locator("#result-card")).to_be_visible()
        assert "(" in chip_text  # chip displays "Name (plu)"
