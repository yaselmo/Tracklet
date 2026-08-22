"""Generate Tracklet favicon assets from the canonical application logo."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_SOURCE = REPOSITORY_ROOT / 'assets/images/logo/Tracklet.png'
DEFAULT_OUTPUT_DIR = (
    Path(__file__).resolve().parents[1] / 'Tracklet/static/img/favicon'
)

PNG_SIZES = {
    'android-icon-36x36.png': 36,
    'android-icon-48x48.png': 48,
    'android-icon-72x72.png': 72,
    'android-icon-96x96.png': 96,
    'android-icon-144x144.png': 144,
    'android-icon-192x192.png': 192,
    'apple-icon-57x57.png': 57,
    'apple-icon-60x60.png': 60,
    'apple-icon-72x72.png': 72,
    'apple-icon-76x76.png': 76,
    'apple-icon-114x114.png': 114,
    'apple-icon-120x120.png': 120,
    'apple-icon-144x144.png': 144,
    'apple-icon-152x152.png': 152,
    'apple-icon-180x180.png': 180,
    'apple-icon.png': 192,
    'apple-icon-precomposed.png': 192,
    'favicon-16x16.png': 16,
    'favicon-32x32.png': 32,
    'favicon-96x96.png': 96,
    'ms-icon-70x70.png': 70,
    'ms-icon-144x144.png': 144,
    'ms-icon-150x150.png': 150,
    'ms-icon-310x310.png': 310,
}


def square_icon(source: Image.Image, size: int) -> Image.Image:
    """Fit the complete logo onto a transparent square without distortion."""
    icon = source.copy()
    icon.thumbnail((size, size), Image.Resampling.LANCZOS, reducing_gap=3.0)

    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    offset = ((size - icon.width) // 2, (size - icon.height) // 2)
    canvas.alpha_composite(icon, offset)
    return canvas


def generate_favicons(source_path: Path, output_dir: Path) -> None:
    """Write the complete PNG and multi-resolution ICO favicon set."""
    output_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(source_path) as image:
        source = image.convert('RGBA')

    for filename, size in PNG_SIZES.items():
        square_icon(source, size).save(
            output_dir / filename,
            format='PNG',
            optimize=True,
            compress_level=9,
        )

    square_icon(source, 256).save(
        output_dir / 'favicon.ico',
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


def main() -> None:
    """Parse command-line arguments and generate favicon files."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()
    generate_favicons(args.source.resolve(), args.output_dir.resolve())


if __name__ == '__main__':
    main()
