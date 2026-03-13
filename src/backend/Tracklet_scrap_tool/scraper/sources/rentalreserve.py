"""Rental Reserve scraper implementation with requests/BS4 and Playwright fallback."""

from __future__ import annotations

import json
import logging
import random
import time
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag

from scraper.config import BASE_URL, DEFAULT_HEADERS, SOURCE_VENDOR
from scraper.utils import clean_text, derive_external_id

LOGGER = logging.getLogger(__name__)


@dataclass
class ProductLink:
    name: str
    source_url: str


@dataclass
class SubcategoryLink:
    main_category: str
    subcategory: str
    subcategory_slug: str
    source_url: str


class RentalReserveScraper:
    def __init__(self, delay_range: tuple[float, float] = (0.8, 1.6), timeout: int = 30) -> None:
        self.delay_range = delay_range
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    def scrape_category(self, category_label: str, category_slug: str, category_url: str) -> list[dict[str, str]]:
        rows = self.scrape_subcategory(
            main_category=category_label,
            subcategory=category_label,
            subcategory_slug=category_slug,
            subcategory_url=category_url,
        )

        # Backward-compatible output shape for legacy --category mode.
        return [
            {
                "name": row["name"],
                "category": row["subcategory"],
                "source_url": row["source_url"],
                "image_url": row["image_url"],
                "source_vendor": row["source_vendor"],
                "external_id": row["external_id"],
            }
            for row in rows
        ]

    def scrape_subcategory(
        self,
        main_category: str,
        subcategory: str,
        subcategory_slug: str,
        subcategory_url: str,
        limit: int | None = None,
    ) -> list[dict[str, str]]:
        LOGGER.info("Scraping subcategory: %s (%s)", subcategory, subcategory_url)
        try:
            category_html = self._get_html(subcategory_url)
        except Exception as exc:  # noqa: BLE001
            LOGGER.error("Failed to load subcategory page %s: %s", subcategory_url, exc)
            return []
        product_links = self._extract_product_links(category_html, subcategory_url)
        if not product_links:
            LOGGER.info("No products detected statically on %s. Trying Playwright fallback.", subcategory)
            rendered_html = self._get_html_with_playwright(subcategory_url)
            if rendered_html:
                product_links = self._extract_product_links(rendered_html, subcategory_url)

        LOGGER.info("Discovered %d candidate product links", len(product_links))

        rows: list[dict[str, str]] = []

        for index, link in enumerate(product_links, start=1):
            if limit is not None and len(rows) >= limit:
                break

            LOGGER.info("[%d/%d] Processing %s", index, len(product_links), link.source_url)
            image_url = ""
            try:
                product_html = self._get_html(link.source_url)
                image_url = self._extract_main_image_url(product_html, link.source_url)
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("Failed static scrape for %s: %s", link.source_url, exc)

            if not image_url:
                image_url = self._extract_image_with_playwright(link.source_url)

            row = {
                "name": clean_text(link.name),
                "main_category": clean_text(main_category),
                "subcategory": clean_text(subcategory),
                "source_url": link.source_url,
                "image_url": clean_text(image_url),
                "source_vendor": SOURCE_VENDOR,
                "external_id": derive_external_id(link.source_url, subcategory_slug),
            }

            if row["name"] and row["source_url"]:
                rows.append(row)

            self._sleep()

        LOGGER.info("Found %d products in subcategory %s", len(rows), subcategory)
        return rows

    def discover_navigation(self, start_url: str = BASE_URL) -> list[SubcategoryLink]:
        LOGGER.info("Discovering categories from navigation: %s", start_url)
        try:
            html = self._get_html(start_url)
        except Exception as exc:  # noqa: BLE001
            LOGGER.error("Failed to load navigation page %s: %s", start_url, exc)
            html = ""
        if not html:
            rendered_html = self._get_html_with_playwright(start_url)
            if not rendered_html:
                return []
            rendered_soup = BeautifulSoup(rendered_html, "lxml")
            return self._discover_nav_from_soup(rendered_soup)

        soup = BeautifulSoup(html, "lxml")
        links = self._discover_nav_from_soup(soup)
        if links:
            return links

        LOGGER.info("Static navigation discovery returned no subcategories. Trying Playwright fallback.")
        rendered_html = self._get_html_with_playwright(start_url)
        if not rendered_html:
            return []
        rendered_soup = BeautifulSoup(rendered_html, "lxml")
        return self._discover_nav_from_soup(rendered_soup)

    def _get_html(self, url: str) -> str:
        response = self.session.get(url, timeout=self.timeout)
        response.raise_for_status()
        return response.text

    def _extract_product_links(self, category_html: str, category_url: str) -> list[ProductLink]:
        soup = BeautifulSoup(category_html, "lxml")
        product_grid = self._find_product_grid(soup) or soup

        candidates: list[ProductLink] = []
        image_nodes = product_grid.select("img[src], img[data-src]")
        for img in image_nodes:
            if not isinstance(img, Tag):
                continue

            card = self._find_product_card_from_image(img)
            anchor = self._find_closest_anchor(img, card)
            if anchor is None:
                continue

            href = clean_text(anchor.get("href"))
            if not href or href.startswith("#"):
                continue

            absolute_url = urljoin(BASE_URL, href)
            if not self._is_valid_site_url(absolute_url):
                continue
            if self._is_blocked_non_product_url(absolute_url):
                continue
            if not self._is_likely_product_url(absolute_url, category_url):
                continue

            name = self._extract_name_from_squarespace_card(card, anchor, img)
            if not name:
                continue

            LOGGER.info("Detected product: %s", name)
            candidates.append(ProductLink(name=name, source_url=absolute_url))

        deduped: list[ProductLink] = []
        seen_urls: set[str] = set()
        for item in candidates:
            if item.source_url in seen_urls:
                continue
            seen_urls.add(item.source_url)
            deduped.append(item)
        return deduped

    def _discover_nav_from_soup(self, soup: BeautifulSoup) -> list[SubcategoryLink]:
        discovered: list[SubcategoryLink] = []
        seen_urls: set[str] = set()

        nav_containers = soup.select("header nav, nav")
        for nav in nav_containers:
            for folder in nav.select("li"):
                nested_list = folder.select_one("ul, ol")
                if not isinstance(nested_list, Tag):
                    continue

                main_label = self._extract_main_category_label(folder)
                if not main_label:
                    continue

                for sub_anchor in nested_list.select("a[href]"):
                    href = clean_text(sub_anchor.get("href"))
                    if not href:
                        continue
                    sub_url = urljoin(BASE_URL, href)
                    if not self._is_valid_site_url(sub_url):
                        continue
                    if not self._looks_like_subcategory_url(sub_url):
                        continue
                    if sub_url in seen_urls:
                        continue

                    subcategory = self._normalize_subcategory_name(sub_anchor)
                    if not subcategory:
                        continue

                    item = SubcategoryLink(
                        main_category=main_label,
                        subcategory=subcategory,
                        subcategory_slug=self._slug_from_url(sub_url),
                        source_url=sub_url,
                    )
                    seen_urls.add(sub_url)
                    discovered.append(item)
                    LOGGER.info("Discovered subcategory: %s -> %s", subcategory, sub_url)

        # Fallback pass for menus where nested semantics are flattened.
        if not discovered:
            for anchor in soup.select("header nav a[href], nav a[href]"):
                href = clean_text(anchor.get("href"))
                if not href:
                    continue
                sub_url = urljoin(BASE_URL, href)
                if not self._is_valid_site_url(sub_url):
                    continue
                if not self._looks_like_subcategory_url(sub_url):
                    continue
                if sub_url in seen_urls:
                    continue

                subcategory = self._normalize_subcategory_name(anchor)
                if not subcategory:
                    continue
                main_category = self._infer_main_from_ancestors(anchor) or "Uncategorized"
                item = SubcategoryLink(
                    main_category=main_category,
                    subcategory=subcategory,
                    subcategory_slug=self._slug_from_url(sub_url),
                    source_url=sub_url,
                )
                seen_urls.add(sub_url)
                discovered.append(item)
                LOGGER.info("Discovered subcategory: %s -> %s", subcategory, sub_url)

        seen_main: set[str] = set()
        for link in discovered:
            normalized_main = clean_text(link.main_category)
            if normalized_main and normalized_main.lower() not in seen_main:
                LOGGER.info("Discovered main category: %s", normalized_main)
                seen_main.add(normalized_main.lower())

        return discovered

    def _find_product_grid(self, soup: BeautifulSoup) -> Tag | None:
        selectors = (
            "main .summary-item-list",
            "main .summary-block-wrapper",
            "main .sqs-gallery-block-grid",
            "main .grid-item",
            "main .summary-item",
            "main [class*='summary-item']",
            "main [class*='grid-item']",
            "main [class*='collection-grid']",
        )
        for selector in selectors:
            node = soup.select_one(selector)
            if isinstance(node, Tag) and node.select_one("a[href]"):
                return node
        return None

    def _extract_name_from_squarespace_card(self, card: Tag, anchor: Tag, img: Tag) -> str:
        for selector in (
            ".summary-title",
            ".summary-item-title",
            ".summary-title-link",
            ".image-caption p",
            ".sqs-dynamic-text",
            "figcaption",
            "[class*='caption']",
            "[class*='title']",
            "h1",
            "h2",
            "h3",
            "h4",
        ):
            node = card.select_one(selector)
            if isinstance(node, Tag):
                name = clean_text(node.get_text(" ", strip=True))
                if name:
                    return name

        img_alt = clean_text(img.get("alt"))
        if img_alt:
            return img_alt

        for selector in ("h1", "h2", "h3", "h4", "[class*='title']", "[class*='name']"):
            node = card.select_one(selector)
            if isinstance(node, Tag):
                name = clean_text(node.get_text(" ", strip=True))
                if name:
                    return name

        anchor_text = clean_text(anchor.get_text(" ", strip=True))
        if anchor_text:
            return anchor_text

        img = card.select_one("img[alt]")
        if isinstance(img, Tag):
            alt = clean_text(img.get("alt"))
            if alt:
                return alt
        return ""

    def _is_blocked_non_product_url(self, absolute_url: str) -> bool:
        parsed = urlparse(absolute_url)
        path = parsed.path.rstrip("/").lower()

        blocked_paths = {
            "",
            "/",
            "/flatware",
            "/glasses",
            "/glassware",
            "/chairs",
            "/lounge-furniture",
            "/rental-collection-3iz1r/flatware",
            "/rental-collection-3iz1r/glasses",
            "/rental-collection-3iz1r/glassware",
            "/rental-collection-3iz1r/chairs",
            "/rental-collection-3iz1r/lounge-furniture",
        }
        if path in blocked_paths:
            return True

        if absolute_url.rstrip("/") == BASE_URL.rstrip("/"):
            return True

        return False

    def _is_likely_product_url(self, absolute_url: str, subcategory_url: str = "") -> bool:
        path = urlparse(absolute_url).path.lower()
        if not path or path == "/":
            return False
        if "/rental-collection" not in path:
            return False
        if subcategory_url and absolute_url.rstrip("/") == subcategory_url.rstrip("/"):
            return False
        return True

    def _find_product_card_from_image(self, img: Tag) -> Tag:
        card = img.find_parent(
            class_=lambda c: c
            and any(
                token in " ".join(c if isinstance(c, list) else [str(c)]).lower()
                for token in (
                    "summary-item-record-type-product",
                    "summary-item",
                    "grid-item",
                    "sqs-block-image",
                )
            )
        )
        if isinstance(card, Tag):
            return card
        parent = img.parent
        return parent if isinstance(parent, Tag) else img

    def _find_closest_anchor(self, img: Tag, card: Tag) -> Tag | None:
        anchor = img.find_parent("a", href=True)
        if isinstance(anchor, Tag):
            return anchor
        anchor = card.select_one("a[href]")
        return anchor if isinstance(anchor, Tag) else None

    def _looks_like_subcategory_url(self, absolute_url: str) -> bool:
        parsed = urlparse(absolute_url)
        path = parsed.path.rstrip("/")
        if not path:
            return False
        lower_path = path.lower()
        if "/rental-collection" not in lower_path:
            return False
        if lower_path.endswith("/rental-collection"):
            return False
        return True

    def _extract_main_category_label(self, folder: Tag) -> str:
        direct_parent = folder.find(["a", "span", "button"], recursive=False)
        if isinstance(direct_parent, Tag):
            text = clean_text(direct_parent.get_text(" ", strip=True))
            if text:
                return text

        for selector in (".folder-title", ".nav-folder-title", ".Header-nav-folder-title"):
            node = folder.select_one(selector)
            if isinstance(node, Tag):
                text = clean_text(node.get_text(" ", strip=True))
                if text:
                    return text
        return ""

    def _normalize_subcategory_name(self, anchor: Tag) -> str:
        text = clean_text(anchor.get_text(" ", strip=True))
        if text:
            return text
        aria = clean_text(anchor.get("aria-label"))
        if aria:
            return aria
        return self._slug_from_url(urljoin(BASE_URL, clean_text(anchor.get("href")))).replace("-", " ").title()

    def _slug_from_url(self, absolute_url: str) -> str:
        parsed = urlparse(absolute_url)
        parts = [part for part in parsed.path.split("/") if part]
        if not parts:
            return ""
        return clean_text(parts[-1]).lower()

    def _infer_main_from_ancestors(self, anchor: Tag) -> str:
        parent_li = anchor.find_parent("li")
        if not isinstance(parent_li, Tag):
            return ""

        ancestor_li = parent_li.find_parent("li")
        if isinstance(ancestor_li, Tag):
            label = self._extract_main_category_label(ancestor_li)
            if label:
                return label

        sibling_label = parent_li.find_previous_sibling(["a", "span", "button"])
        if isinstance(sibling_label, Tag):
            text = clean_text(sibling_label.get_text(" ", strip=True))
            if text:
                return text
        return ""

    def _extract_links_from_ldjson(self, soup: BeautifulSoup) -> list[ProductLink]:
        links: list[ProductLink] = []
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            raw = script.string or script.get_text() or ""
            raw = raw.strip()
            if not raw:
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            for entry in self._iter_ldjson_entries(data):
                if not isinstance(entry, dict):
                    continue
                item_type = clean_text(str(entry.get("@type", ""))).lower()
                if item_type not in {"itemlist", "collectionpage", "webpage"}:
                    continue
                for item in entry.get("itemListElement", []) or []:
                    target = item.get("item") if isinstance(item, dict) else None
                    if isinstance(target, dict):
                        name = clean_text(target.get("name"))
                        url = clean_text(target.get("url"))
                    else:
                        name = clean_text(item.get("name") if isinstance(item, dict) else "")
                        url = clean_text(item.get("url") if isinstance(item, dict) else "")
                    if name and url:
                        full_url = urljoin(BASE_URL, url)
                        if self._is_valid_site_url(full_url):
                            links.append(ProductLink(name=name, source_url=full_url))

        deduped: list[ProductLink] = []
        seen: set[str] = set()
        for link in links:
            if link.source_url in seen:
                continue
            seen.add(link.source_url)
            deduped.append(link)
        return deduped

    def _iter_ldjson_entries(self, payload: object) -> Iterable[dict]:
        if isinstance(payload, list):
            for entry in payload:
                if isinstance(entry, dict):
                    yield entry
            return
        if isinstance(payload, dict):
            graph = payload.get("@graph")
            if isinstance(graph, list):
                for entry in graph:
                    if isinstance(entry, dict):
                        yield entry
            yield payload

    def _extract_anchor_name(self, anchor: Tag) -> str:
        text = clean_text(anchor.get_text(" ", strip=True))
        if text:
            return text

        img = anchor.find("img")
        if img:
            alt_text = clean_text(img.get("alt"))
            if alt_text:
                return alt_text

        return ""

    def _looks_like_product_anchor(self, anchor: Tag, absolute_url: str) -> bool:
        lower_url = absolute_url.lower()
        blocked_tokens = (
            "/contact",
            "/about",
            "/faq",
            "/privacy",
            "/terms",
            "/cart",
            "/checkout",
            "/blog",
        )
        if any(token in lower_url for token in blocked_tokens):
            return False

        class_tokens = " ".join(anchor.get("class", []))
        class_tokens = clean_text(class_tokens).lower()
        parent_classes = ""
        if isinstance(anchor.parent, Tag):
            parent_classes = clean_text(" ".join(anchor.parent.get("class", []))).lower()

        heuristic_tokens = ("product", "item", "card", "collection")
        if any(token in class_tokens for token in heuristic_tokens):
            return True
        if any(token in parent_classes for token in heuristic_tokens):
            return True

        return bool(anchor.find("img"))

    def _extract_main_image_url(self, product_html: str, page_url: str) -> str:
        soup = BeautifulSoup(product_html, "lxml")

        for selector in (
            'meta[property="og:image"]',
            'meta[name="twitter:image"]',
            'meta[property="twitter:image"]',
        ):
            node = soup.select_one(selector)
            if node and node.get("content"):
                return urljoin(page_url, clean_text(node.get("content")))

        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            raw = script.string or script.get_text() or ""
            raw = raw.strip()
            if not raw:
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            image_url = self._extract_image_from_ldjson(data)
            if image_url:
                return urljoin(page_url, image_url)

        for selector in (
            "main img[src]",
            "article img[src]",
            "img[src]",
        ):
            node = soup.select_one(selector)
            if node and node.get("src"):
                return urljoin(page_url, clean_text(node.get("src")))

        return ""

    def _extract_image_from_ldjson(self, payload: object) -> str:
        entries = list(self._iter_ldjson_entries(payload))
        for entry in entries:
            item_type = clean_text(str(entry.get("@type", ""))).lower()
            if item_type not in {"product", "imageobject", "webpage", "thing"}:
                continue

            for key in ("image", "thumbnailUrl", "contentUrl"):
                value = entry.get(key)
                image_url = self._normalize_ldjson_image_value(value)
                if image_url:
                    return image_url
        return ""

    def _normalize_ldjson_image_value(self, value: object) -> str:
        if isinstance(value, str):
            return clean_text(value)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and clean_text(item):
                    return clean_text(item)
                if isinstance(item, dict):
                    candidate = clean_text(item.get("url") or item.get("contentUrl"))
                    if candidate:
                        return candidate
        if isinstance(value, dict):
            return clean_text(value.get("url") or value.get("contentUrl"))
        return ""

    def _extract_image_with_playwright(self, page_url: str) -> str:
        try:
            from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
            from playwright.sync_api import sync_playwright
        except ImportError:
            LOGGER.debug("Playwright not installed; skipping JS fallback for %s", page_url)
            return ""

        LOGGER.debug("Trying Playwright fallback for image on %s", page_url)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(user_agent=DEFAULT_HEADERS["User-Agent"])
                page = context.new_page()
                page.goto(page_url, wait_until="networkidle", timeout=self.timeout * 1000)
                page.wait_for_timeout(700)

                image_url = page.locator('meta[property="og:image"]').first.get_attribute("content")
                if not image_url:
                    image_url = page.locator("img[src]").first.get_attribute("src")

                context.close()
                browser.close()

                return urljoin(page_url, clean_text(image_url)) if image_url else ""
        except PlaywrightTimeoutError:
            LOGGER.warning("Playwright timeout for %s", page_url)
        except Exception as exc:  # noqa: BLE001
            LOGGER.debug("Playwright fallback failed for %s: %s", page_url, exc)
        return ""

    def _get_html_with_playwright(self, page_url: str) -> str:
        try:
            from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
            from playwright.sync_api import sync_playwright
        except ImportError:
            LOGGER.debug("Playwright not installed; skipping HTML fallback for %s", page_url)
            return ""

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(user_agent=DEFAULT_HEADERS["User-Agent"])
                page = context.new_page()
                page.goto(page_url, wait_until="networkidle", timeout=self.timeout * 1000)
                page.wait_for_timeout(1000)
                content = page.content()
                context.close()
                browser.close()
                return content
        except PlaywrightTimeoutError:
            LOGGER.warning("Playwright timeout while rendering page %s", page_url)
        except Exception as exc:  # noqa: BLE001
            LOGGER.debug("Playwright HTML fallback failed for %s: %s", page_url, exc)
        return ""

    def _is_valid_site_url(self, url: str) -> bool:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            return False
        return parsed.netloc.endswith("rentalreserve.ca")

    def _sleep(self) -> None:
        delay = random.uniform(*self.delay_range)
        time.sleep(delay)
