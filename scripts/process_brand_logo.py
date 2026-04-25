#!/usr/bin/env python3
"""Process the AutoTradeIL brand logo into the asset set.

Inputs:
  apps/web/public/logo-full.jpeg   — the source WhatsApp lockup
                                     (1408x768, RGB, cream bg)

Outputs in apps/web/public/:
  logo-full.png           — full lockup, white→transparent, trimmed
  logo-icon.png           — square shield+car-mark only, transparent bg
  favicon-16x16.png
  favicon-32x32.png
  favicon.ico             (16+32+48)
  apple-touch-icon.png    180x180 (icon centered on navy)
  og-image.png            1200x630 social card with full lockup + RTL Hebrew
                          tagline (proper BIDI shaping)

Why scripted: lets the team rerun on logo updates without re-cropping by
hand. Idempotent — safe to rerun.
"""
from __future__ import annotations

from pathlib import Path

from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

PUBLIC = Path(__file__).resolve().parent.parent / "apps" / "web" / "public"
SRC = PUBLIC / "logo-full.jpeg"

NAVY = "#1B2B4B"
GOLD = "#C9A84C"
CREAM = "#F8F8F6"

SERIF_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SERIF_REG = "/System/Library/Fonts/Supplemental/Georgia.ttf"
HEBREW = "/System/Library/Fonts/SFHebrew.ttf"
# Arial Unicode covers both Hebrew + Latin + punctuation. Use for any
# string that mixes scripts (eyebrow with year, B2B badge, etc.) so the
# Latin glyphs don't render as .notdef boxes.
UNICODE = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def whiten_to_alpha(img: Image.Image, threshold: int = 215) -> Image.Image:
    """Convert near-white/cream pixels to transparent.

    The source WhatsApp file has a warm cream background (~RGB 240/240/235)
    so the threshold has to dip below that. We additionally hard-clear any
    pixel whose channels are all >=threshold to avoid the slight halo that
    a soft ramp leaves on a bright surface.
    """
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            mn = min(r, g, b)
            if mn >= threshold:
                # Hard cut once we're confident this is background. Keeps
                # the brand colors intact and eliminates the cream halo.
                pixels[x, y] = (r, g, b, 0)
            elif mn >= threshold - 18:
                # Ramp alpha for the anti-aliased pixels just inside the
                # threshold so edges blend cleanly onto any background.
                ramp = (mn - (threshold - 18)) / 18
                pixels[x, y] = (r, g, b, max(0, int(a * (1 - ramp))))
    return img


def trim_transparent(img: Image.Image) -> Image.Image:
    """Trim transparent borders down to the visible bounding box."""
    img = img.convert("RGBA")
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def crop_shield(full: Image.Image) -> Image.Image:
    """Extract just the shield+car mark from the full lockup.

    The mark sits in the left ~36% of the image with the shield centered
    vertically. We crop with generous padding then trim transparency.
    """
    w, h = full.size  # 1408 x 768
    # Shield fits roughly in left 38% of the lockup horizontally,
    # full vertical extent. Adjust if logo file changes.
    left = int(w * 0.10)
    right = int(w * 0.40)
    top = int(h * 0.15)
    bottom = int(h * 0.92)
    return full.crop((left, top, right, bottom))


def square_pad(img: Image.Image, *, bg=(0, 0, 0, 0)) -> Image.Image:
    """Pad a rectangular RGBA image to a centered square."""
    img = img.convert("RGBA")
    w, h = img.size
    side = max(w, h)
    # ~6% breathing room
    side = int(side * 1.12)
    canvas = Image.new("RGBA", (side, side), bg)
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


def recolor_to(img: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Replace every visible (alpha > 0) pixel with the given RGB while
    preserving alpha. Used to derive a single-color variant of the logo
    (e.g. all-white) for dark backgrounds. Anti-aliased edges keep their
    softness because alpha is preserved untouched."""
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            _r, _g, _b, a = pixels[x, y]
            if a > 0:
                pixels[x, y] = (rgb[0], rgb[1], rgb[2], a)
    return img


def write_logo_full() -> Image.Image:
    src = Image.open(SRC).convert("RGBA")
    transparent = whiten_to_alpha(src, threshold=215)
    trimmed = trim_transparent(transparent)
    out = PUBLIC / "logo-full.png"
    trimmed.save(out, format="PNG", optimize=True)
    print(f"  wrote {out.name}  ({trimmed.size[0]}x{trimmed.size[1]})")

    # White-recolored variant for dark backgrounds (footer).
    white = recolor_to(trimmed.copy(), (248, 248, 246))
    white_out = PUBLIC / "logo-full-white.png"
    white.save(white_out, format="PNG", optimize=True)
    print(f"  wrote {white_out.name}  ({white.size[0]}x{white.size[1]})")

    return src  # return the original (RGB) for downstream cropping


def write_logo_icon(full_rgb: Image.Image) -> Image.Image:
    """Crop the shield, key out white, square-pad, save."""
    shield_rect = crop_shield(full_rgb)
    shield_rgba = whiten_to_alpha(shield_rect, threshold=232)
    shield_trim = trim_transparent(shield_rgba)
    shield_sq = square_pad(shield_trim, bg=(0, 0, 0, 0))
    out = PUBLIC / "logo-icon.png"
    shield_sq.save(out, format="PNG", optimize=True)
    print(f"  wrote {out.name}  ({shield_sq.size[0]}x{shield_sq.size[1]})")
    return shield_sq


def write_favicons(icon: Image.Image) -> None:
    """Square shield → favicons. Multi-size .ico bundle."""
    sizes = [16, 32, 48]
    images = []
    for s in sizes:
        small = icon.resize((s, s), Image.LANCZOS)
        images.append(small)
        if s in (16, 32):
            (PUBLIC / f"favicon-{s}x{s}.png").write_bytes(b"")
            small.save(PUBLIC / f"favicon-{s}x{s}.png", format="PNG", optimize=True)
            print(f"  wrote favicon-{s}x{s}.png")

    images[0].save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=images[1:],
    )
    print("  wrote favicon.ico")


def write_apple_touch(icon: Image.Image) -> None:
    """iOS home-screen — 180x180, white background (iOS rounds the corners
    itself; transparent looks broken inside the rounded mask)."""
    bg = Image.new("RGBA", (180, 180), CREAM)
    fg = icon.resize((164, 164), Image.LANCZOS)
    bg.alpha_composite(fg, ((180 - 164) // 2, (180 - 164) // 2))
    out = PUBLIC / "apple-touch-icon.png"
    bg.convert("RGB").save(out, format="PNG", optimize=True)
    print(f"  wrote {out.name}  (180x180)")


def write_og_image() -> None:
    """1200x630 social card. Navy background, white-recolored full lockup
    on the right (RTL natural), Hebrew headline + gold subtext on the
    left, domain centered at the bottom. No eyebrow.

    BIDI: PIL renders LTR only. python-bidi reorders code points so the
    Hebrew runs render correctly without needing a true HarfBuzz shaper.
    """
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), NAVY)
    draw = ImageDraw.Draw(img)

    # Top + bottom gold accent bars frame the composition.
    draw.rectangle([(0, 0), (W, 6)], fill=GOLD)
    draw.rectangle([(0, H - 6), (W, H)], fill=GOLD)

    # Logo on the right (RTL): use the white-recolored lockup so the
    # navy + bronze brand glyphs show up against the navy background.
    logo_src = PUBLIC / "logo-full-white.png"
    if not logo_src.exists():
        logo_src = PUBLIC / "logo-full.png"
    full = Image.open(logo_src).convert("RGBA")
    target_w = 460
    scale = target_w / full.width
    target_h = int(full.height * scale)
    full_scaled = full.resize((target_w, target_h), Image.LANCZOS)
    logo_x = W - 80 - target_w
    logo_y = (H - target_h) // 2 - 30
    img.paste(full_scaled, (logo_x, logo_y), full_scaled)

    # Left column — text block. Right-edge of the text aligns to the
    # left-edge of the logo with a 60px gutter; we draw right-aligned so
    # Hebrew reads naturally toward the logo.
    text_right_edge = logo_x - 60

    headline = get_display("זירת המסחר של סוחרי הרכב")
    tagline = get_display("פלטפורמה מקצועית לסוחרים מאומתים")

    # Wrap headline on two lines for visual rhythm: split at the middle
    # word so each line is roughly equal length in Hebrew.
    headline_l1 = get_display("זירת המסחר")
    headline_l2 = get_display("של סוחרי הרכב")

    headline_font = load_font(HEBREW, 64)
    tagline_font = load_font(HEBREW, 30)

    block_y = H // 2 - 110

    def draw_right_aligned(y: int, text: str, font, fill):
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        draw.text((text_right_edge - w, y), text, fill=fill, font=font)

    draw_right_aligned(block_y, headline_l1, headline_font, CREAM)
    draw_right_aligned(block_y + 80, headline_l2, headline_font, CREAM)
    draw_right_aligned(block_y + 180, tagline, tagline_font, GOLD)

    # Domain centered at the bottom strip.
    domain_font = load_font(SERIF_REG, 24)
    domain = "autotradeil.com"
    db = draw.textbbox((0, 0), domain, font=domain_font)
    domain_w = db[2] - db[0]
    cream_70 = tuple(int(0.7 * c1 + 0.3 * c2) for c1, c2 in zip((248, 248, 246), (27, 43, 75)))
    draw.text(((W - domain_w) // 2, H - 56), domain, fill=cream_70, font=domain_font)

    out = PUBLIC / "og-image.png"
    img.save(out, format="PNG", optimize=True)
    print(f"  wrote {out.name}  (1200x630)")


def remove_obsolete() -> None:
    """Delete placeholder assets superseded by the real brand."""
    for name in ["logo.svg", "logo-v1.svg", "logo-v2.svg"]:
        p = PUBLIC / name
        if p.exists():
            p.unlink()
            print(f"  removed {name}")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing source logo at {SRC}")
    print(f"processing brand logo from {SRC.name}")
    full_rgb = write_logo_full()
    icon = write_logo_icon(full_rgb)
    write_favicons(icon)
    write_apple_touch(icon)
    write_og_image()
    remove_obsolete()
    print("done.")


if __name__ == "__main__":
    main()
