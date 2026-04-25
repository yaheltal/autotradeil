#!/usr/bin/env python3
"""Generate AutoTradeIL static brand assets from PIL primitives.

Outputs to apps/web/public/:
  - favicon-16x16.png
  - favicon-32x32.png
  - favicon.ico  (multi-size: 16, 32, 48)
  - apple-touch-icon.png  (180x180)
  - og-image.png  (1200x630, navy bg, logo + Hebrew tagline)

Run from repo root:   python3 scripts/generate_brand_assets.py

Why PIL and not the Next.js ImageResponse pattern?
  Per product brief, social media + manifest validators want static URLs
  served from /public, not /opengraph-image dynamic routes. PIL gives us
  reproducible bytes and zero runtime dependency.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# --- Brand spec ---
NAVY = "#1B2B4B"
GOLD = "#C9A84C"
WHITE = "#FFFFFF"
CREAM = "#F8F8F6"

PUBLIC = Path(__file__).resolve().parent.parent / "apps" / "web" / "public"
PUBLIC.mkdir(parents=True, exist_ok=True)

# Font candidates (macOS paths). Falls back to PIL default if missing.
SERIF_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SERIF_REGULAR = "/System/Library/Fonts/Supplemental/Georgia.ttf"
HEBREW = "/System/Library/Fonts/SFHebrew.ttf"
ARIAL_UNICODE = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def make_circle_logo(size: int, *, ring: bool = True) -> Image.Image:
    """Navy disc + gold serif AT monogram, transparent outside."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Disc
    pad = max(1, size // 64)
    draw.ellipse((pad, pad, size - pad, size - pad), fill=NAVY)
    # Inner ring (only at sizes large enough for it to be visible)
    if ring and size >= 64:
        ring_pad = max(2, size // 40)
        # PIL has no per-channel stroke alpha, so we draw a thin gold disc and
        # then a navy disc inside it — net effect: ring of width=stroke.
        draw.ellipse(
            (ring_pad, ring_pad, size - ring_pad, size - ring_pad),
            outline=GOLD,
            width=max(1, size // 180),
        )

    # AT monogram. Optical-tune size so the cap-height fills ~58% of the disc.
    font_size = int(size * 0.52)
    font = load_font(SERIF_BOLD, font_size)
    text = "AT"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    # Optical center: serifs sit slightly low, so nudge upward by ~3%.
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1] - int(size * 0.02)
    draw.text((x, y), text, fill=GOLD, font=font)

    return img


def write_favicons() -> None:
    """16, 32, 48px PNG + multi-size .ico."""
    sizes = [16, 32, 48]
    images: list[Image.Image] = []
    for s in sizes:
        # No inner ring at <64px — would alias to a smudge.
        img = make_circle_logo(s, ring=False)
        images.append(img)
        if s in (16, 32):
            img.save(PUBLIC / f"favicon-{s}x{s}.png", format="PNG")
            print(f"  wrote favicon-{s}x{s}.png")

    # .ico bundles multiple sizes — browsers pick the closest match.
    images[0].save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=images[1:],
    )
    print("  wrote favicon.ico (16+32+48)")


def write_apple_touch_icon() -> None:
    """iOS home-screen icon. 180x180 per HIG. Filled background (no
    transparency) — iOS rounds the corners itself."""
    img = make_circle_logo(180, ring=True)
    # iOS displays the PNG as-is, but a fully transparent background looks
    # awkward inside the rounded mask — composite onto navy so the corners
    # blend with the disc.
    bg = Image.new("RGBA", (180, 180), NAVY)
    bg.alpha_composite(img)
    bg.save(PUBLIC / "apple-touch-icon.png", format="PNG")
    print("  wrote apple-touch-icon.png (180x180)")


def write_og_image() -> None:
    """1200x630 social card. Navy background, logo + Hebrew tagline.

    Layout: logo center-left, headline + tagline right-aligned (RTL).
    Top gold accent bar + bottom domain strip.
    """
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), NAVY)
    draw = ImageDraw.Draw(img)

    # Top accent bar — 8px gold
    draw.rectangle([(0, 0), (W, 8)], fill=GOLD)

    # Logo, vertically centered, 80px from left edge
    LOGO_SIZE = 240
    logo = make_circle_logo(LOGO_SIZE, ring=True)
    logo_x = 80
    logo_y = (H - LOGO_SIZE) // 2
    img.paste(logo, (logo_x, logo_y), logo)

    # Hebrew text — right-aligned (RTL). Try SFHebrew, fall back to Arial Unicode.
    headline_font = load_font(HEBREW, 64)
    if isinstance(headline_font, ImageFont.FreeTypeFont) and headline_font.path == HEBREW:
        # SFHebrew loaded fine
        pass
    else:
        headline_font = load_font(ARIAL_UNICODE, 64)

    tagline_font = load_font(HEBREW, 32) if Path(HEBREW).exists() else load_font(
        ARIAL_UNICODE, 32
    )
    eyebrow_font = load_font(HEBREW, 22) if Path(HEBREW).exists() else load_font(
        ARIAL_UNICODE, 22
    )

    headline = "זירת המסחר ברכבים של ישראל"
    tagline = "פלטפורמה מקצועית לסוחרים מאומתים"
    eyebrow = "AUTOTRADEIL  ·  גיליון 01  ·  2026"

    # Right column: x_right = W - 80 (right margin)
    right_edge = W - 80
    text_block_y = H // 2 - 70

    # Eyebrow (gold, uppercase Latin + Hebrew)
    eb_bbox = draw.textbbox((0, 0), eyebrow, font=eyebrow_font)
    eb_w = eb_bbox[2] - eb_bbox[0]
    draw.text((right_edge - eb_w, text_block_y), eyebrow, fill=GOLD, font=eyebrow_font)

    # Headline (cream)
    hl_bbox = draw.textbbox((0, 0), headline, font=headline_font)
    hl_w = hl_bbox[2] - hl_bbox[0]
    draw.text(
        (right_edge - hl_w, text_block_y + 50),
        headline,
        fill=CREAM,
        font=headline_font,
    )

    # Tagline (cream/70)
    tl_bbox = draw.textbbox((0, 0), tagline, font=tagline_font)
    tl_w = tl_bbox[2] - tl_bbox[0]
    # PIL rgb only — emulate 70% opacity by mixing with navy.
    cream_70 = tuple(int(0.7 * c1 + 0.3 * c2) for c1, c2 in zip((248, 248, 246), (27, 43, 75)))
    draw.text(
        (right_edge - tl_w, text_block_y + 140),
        tagline,
        fill=cream_70,
        font=tagline_font,
    )

    # Bottom strip — divider + domain
    divider_y = H - 80
    draw.line([(80, divider_y), (W - 80, divider_y)], fill=(248, 248, 246, 80), width=1)

    domain_font = load_font(SERIF_REGULAR, 22)
    draw.text((80, divider_y + 22), "autotradeil.com", fill=cream_70, font=domain_font)

    badge_text = "B2B  ·  מאומת  ·  מאובטח"
    badge_font = load_font(HEBREW, 20) if Path(HEBREW).exists() else load_font(
        ARIAL_UNICODE, 20
    )
    bd_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
    bd_w = bd_bbox[2] - bd_bbox[0]
    draw.text(
        (right_edge - bd_w, divider_y + 22),
        badge_text,
        fill=cream_70,
        font=badge_font,
    )

    img.save(PUBLIC / "og-image.png", format="PNG", optimize=True)
    print("  wrote og-image.png (1200x630)")


def main() -> None:
    print(f"writing brand assets to {PUBLIC}")
    write_favicons()
    write_apple_touch_icon()
    write_og_image()
    print("done.")


if __name__ == "__main__":
    main()
