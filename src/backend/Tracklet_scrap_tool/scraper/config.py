"""Configuration for Rental Reserve scraping."""

from __future__ import annotations

BASE_URL = "https://www.rentalreserve.ca"
SOURCE_VENDOR = "Rental Reserve"

CATEGORY_URLS = {
    "chargers": f"{BASE_URL}/rental-collection-3iZ1R/chargers",
}

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
}
