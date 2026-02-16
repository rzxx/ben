#!/usr/bin/env python3

from __future__ import annotations

import argparse
import sys
import io
from pathlib import Path
from typing import Any


ICON_NAMES = ("previous", "play", "pause", "next")
ICON_SIZES = ((16, 16), (20, 20), (24, 24), (32, 32))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build Windows .ico files for taskbar thumbnail toolbar icons from SVGs. "
            "Expected input layout: <input>/<variant>/<name>.svg"
        )
    )
    parser.add_argument(
        "--input",
        default="assets/thumbbar",
        help="Input root directory containing variant folders (default: assets/thumbbar)",
    )
    parser.add_argument(
        "--output",
        default="build/windows/thumbbar",
        help="Output root directory for generated .ico files (default: build/windows/thumbbar)",
    )
    parser.add_argument(
        "--variants",
        default="dark,light",
        help="Comma-separated variant folder names (default: dark,light)",
    )
    return parser.parse_args()


def require_dependency():
    try:
        import resvg_py
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Missing dependency 'resvg-py'. Install with: uv add resvg-py"
        ) from exc

    try:
        from PIL import Image
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Missing dependency 'pillow'. Install with: uv add pillow"
        ) from exc

    return resvg_py, Image


def render_svg_at_size(svg_content: str, width: int, height: int, resvg_py: Any):
    """Render SVG to PIL Image at specific size using resvg-py."""
    from PIL import Image

    png_data = resvg_py.svg_to_bytes(
        svg_string=svg_content,
        width=width,
        height=height,
    )

    img = Image.open(io.BytesIO(png_data))
    return img.convert("RGBA")


def build_variant(
    variant: str,
    input_root: Path,
    output_root: Path,
    resvg_py: Any,
    Image: Any,
) -> None:
    variant_input = input_root / variant
    if not variant_input.is_dir():
        raise FileNotFoundError(f"Variant folder not found: {variant_input}")

    variant_output = output_root / variant
    variant_output.mkdir(parents=True, exist_ok=True)

    for icon_name in ICON_NAMES:
        svg_path = variant_input / f"{icon_name}.svg"
        if not svg_path.is_file():
            raise FileNotFoundError(f"Missing icon source: {svg_path}")

        svg_content = svg_path.read_text()

        # Render at each target size individually
        images = []
        for width, height in ICON_SIZES:
            img = render_svg_at_size(svg_content, width, height, resvg_py)
            images.append(img)

        # Save as multi-size ICO
        ico_path = variant_output / f"{icon_name}.ico"
        images[0].save(
            ico_path,
            format="ICO",
            sizes=ICON_SIZES,
            append_images=images[1:],
        )


def main() -> int:
    args = parse_args()

    variants = [v.strip() for v in args.variants.split(",") if v.strip()]
    if not variants:
        print("No variants specified.", file=sys.stderr)
        return 1

    input_root = Path(args.input).resolve()
    output_root = Path(args.output).resolve()

    try:
        resvg_py, Image = require_dependency()
        for variant in variants:
            build_variant(
                variant=variant,
                input_root=input_root,
                output_root=output_root,
                resvg_py=resvg_py,
                Image=Image,
            )
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Generated thumbbar icons in: {output_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
