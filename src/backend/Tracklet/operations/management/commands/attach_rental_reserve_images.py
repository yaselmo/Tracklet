"""Bulk attach scraped Rental Reserve images to already imported Part records."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from part.models import Part

METADATA_KEY = 'rental_reserve_import'
VALID_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp', '.jfif'}


class Command(BaseCommand):
    help = (
        'Attach downloaded scraper image files to Part.image for matching Part '
        'records, using Rental Reserve import metadata when available and '
        'falling back to link / name matching otherwise'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--images-root',
            type=str,
            default='src/backend/Tracklet_scrap_tool',
            help=(
                'Base scraper directory or images directory used to resolve '
                'metadata local_image_path values '
                '(default: src/backend/Tracklet_scrap_tool)'
            ),
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report matches without writing image files',
        )
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Replace existing Part.image values instead of skipping them',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Print row-level actions',
        )

    @staticmethod
    def _normalize_spaces(value: str) -> str:
        return re.sub(r'\s+', ' ', (value or '').strip())

    @classmethod
    def _slugify(cls, value: str) -> str:
        normalized = cls._normalize_spaces(value).casefold()
        normalized = re.sub(r'[^a-z0-9]+', '-', normalized)
        return normalized.strip('-')

    def _log(self, verbose: bool, message: str):
        if verbose:
            self.stdout.write(message)

    def _resolve_images_root(self, raw_path: str) -> Path:
        candidate = Path(str(raw_path).strip())
        if not str(candidate):
            raise CommandError('--images-root cannot be empty')

        if not candidate.is_absolute():
            search_roots = [Path.cwd(), *Path.cwd().parents]
            resolved_candidate = None

            for root in search_roots:
                probe = (root / candidate).resolve()
                if probe.exists():
                    resolved_candidate = probe
                    break

            if resolved_candidate is None:
                raise CommandError(f'Images root not found: {candidate}')

            candidate = resolved_candidate
        elif not candidate.exists():
            raise CommandError(f'Images root not found: {candidate}')

        if candidate.is_dir() and candidate.name.casefold() == 'images':
            return candidate

        nested_images = candidate / 'images'
        if nested_images.exists() and nested_images.is_dir():
            return nested_images.resolve()

        return candidate

    def _build_filename_index(self, images_root: Path) -> dict[str, Path]:
        index: dict[str, Path] = {}

        for path in images_root.rglob('*'):
            if not path.is_file():
                continue
            if path.suffix.casefold() not in VALID_SUFFIXES:
                continue

            keys = {
                self._slugify(path.stem),
                self._slugify(path.name),
            }

            for key in filter(None, keys):
                index.setdefault(key, path)

        return index

    def _candidate_paths_from_metadata(
        self, *, local_image_path: str, images_root: Path
    ) -> list[Path]:
        if not local_image_path:
            return []

        raw = Path(local_image_path)
        candidates: list[Path] = []

        if raw.is_absolute():
            candidates.append(raw)
            return candidates

        candidates.append((images_root / raw).resolve())

        raw_parts = raw.parts
        if raw_parts and raw_parts[0].casefold() == 'images':
            trimmed = Path(*raw_parts[1:])
            candidates.append((images_root / trimmed).resolve())

        candidates.append((images_root / raw.name).resolve())

        deduped: list[Path] = []
        seen: set[str] = set()

        for candidate in candidates:
            key = str(candidate)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(candidate)

        return deduped

    def _find_image_for_part(
        self,
        *,
        part: Part,
        images_root: Path,
        filename_index: dict[str, Path],
    ) -> tuple[Path | None, str]:
        payload = (part.metadata or {}).get(METADATA_KEY, {})

        if not isinstance(payload, dict):
            payload = {}

        local_image_path = self._normalize_spaces(str(payload.get('local_image_path') or ''))

        for candidate in self._candidate_paths_from_metadata(
            local_image_path=local_image_path,
            images_root=images_root,
        ):
            if candidate.exists() and candidate.is_file():
                return candidate, 'metadata.local_image_path'

        external_id = self._normalize_spaces(str(payload.get('external_id') or ''))
        if external_id:
            match = filename_index.get(self._slugify(external_id))
            if match is not None:
                return match, 'metadata.external_id'

        link = self._normalize_spaces(
            str(payload.get('source_url') or getattr(part, 'link', '') or '')
        )

        if link:
            parsed = urlparse(link)
            path_parts = [part for part in parsed.path.split('/') if part]

            for path_part in reversed(path_parts):
                match = filename_index.get(self._slugify(path_part))
                if match is not None:
                    return match, 'part.link'

        match = filename_index.get(self._slugify(part.name))
        if match is not None:
            return match, 'part.name'

        return None, 'no_match'

    def _iter_candidate_parts(self, *, overwrite: bool):
        queryset = Part.objects.order_by('pk')

        if not overwrite:
            queryset = queryset.filter(Q(image__isnull=True) | Q(image=''))

        return queryset.iterator()

    def handle(self, *args, **options):
        dry_run = bool(options['dry_run'])
        overwrite = bool(options['overwrite'])
        verbose = bool(options['verbose'])
        images_root = self._resolve_images_root(options['images_root'])
        filename_index = self._build_filename_index(images_root)

        if not filename_index:
            raise CommandError(
                f'No image files found under {images_root} '
                f'with supported suffixes: {", ".join(sorted(VALID_SUFFIXES))}'
            )

        stats = {
            'parts_seen': 0,
            'attached': 0,
            'skipped_existing_image': 0,
            'skipped_missing_match': 0,
            'skipped_missing_file': 0,
            'errors': 0,
        }

        for part in self._iter_candidate_parts(overwrite=overwrite):
            stats['parts_seen'] += 1

            try:
                if part.image and not overwrite:
                    stats['skipped_existing_image'] += 1
                    self._log(
                        verbose,
                        f'[{part.pk}] skipped existing image: {part.name}',
                    )
                    continue

                image_path, match_source = self._find_image_for_part(
                    part=part,
                    images_root=images_root,
                    filename_index=filename_index,
                )

                if image_path is None:
                    stats['skipped_missing_match'] += 1
                    self._log(verbose, f'[{part.pk}] no image match: {part.name}')
                    continue

                if not image_path.exists() or not image_path.is_file():
                    stats['skipped_missing_file'] += 1
                    self._log(
                        verbose,
                        f'[{part.pk}] matched file missing: {image_path}',
                    )
                    continue

                if dry_run:
                    stats['attached'] += 1
                    self._log(
                        verbose,
                        f'[{part.pk}] would attach ({match_source}): {part.name} <- {image_path}',
                    )
                    continue

                with transaction.atomic():
                    with image_path.open('rb') as image_file:
                        part.image.save(image_path.name, File(image_file), save=False)
                    part.save()

                stats['attached'] += 1
                self._log(
                    verbose,
                    f'[{part.pk}] attached ({match_source}): {part.name} <- {image_path}',
                )
            except Exception as exc:
                stats['errors'] += 1
                self.stdout.write(
                    self.style.WARNING(
                        f'[{part.pk}] error for "{part.name}": '
                        f'{exc.__class__.__name__}: {exc}'
                    )
                )

        self.stdout.write('')
        self.stdout.write('Attach Rental Reserve images summary')
        self.stdout.write(f"- mode: {'dry-run' if dry_run else 'write'}")
        self.stdout.write(f'- images root: {images_root}')
        self.stdout.write(f"- overwrite existing: {'yes' if overwrite else 'no'}")
        self.stdout.write(f"- imported parts scanned: {stats['parts_seen']}")
        self.stdout.write(f"- attached: {stats['attached']}")
        self.stdout.write(
            f"- skipped existing image: {stats['skipped_existing_image']}"
        )
        self.stdout.write(
            f"- skipped missing match: {stats['skipped_missing_match']}"
        )
        self.stdout.write(
            f"- skipped missing file: {stats['skipped_missing_file']}"
        )
        self.stdout.write(f"- errors: {stats['errors']}")
