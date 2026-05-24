"""One-shot script to mint placeholder branding assets.

Run from anywhere:
    python apps/mobile/assets/generate_placeholders.py
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
BLUE = (30, 64, 175, 255)  # #1e40af
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/Arial Bold.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _draw_centered(img: Image.Image, text: str, font: ImageFont.ImageFont, fill: tuple[int, int, int, int]) -> None:
    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (img.width - w) / 2 - bbox[0]
    y = (img.height - h) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=fill)


def make_icon(size: int, transparent: bool = False) -> Image.Image:
    bg = TRANSPARENT if transparent else BLUE
    img = Image.new("RGBA", (size, size), bg)
    if transparent:
        # Draw the rounded square fill so the icon shape is still visible.
        draw = ImageDraw.Draw(img)
        radius = int(size * 0.22)
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BLUE)
    font = _load_font(int(size * 0.42))
    _draw_centered(img, "AT", font, WHITE)
    return img


def make_splash(width: int, height: int) -> Image.Image:
    img = Image.new("RGBA", (width, height), BLUE)
    font = _load_font(int(min(width, height) * 0.09))
    _draw_centered(img, "AutoTradeIL", font, WHITE)
    return img


def main() -> None:
    targets = [
        ("icon.png", make_icon(1024)),
        ("adaptive-icon.png", make_icon(1024, transparent=True)),
        ("favicon.png", make_icon(48)),
        ("splash.png", make_splash(1284, 2778)),
    ]
    for name, img in targets:
        path = os.path.join(OUT_DIR, name)
        img.save(path, format="PNG", optimize=True)
        print(f"wrote {path} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
