"""Generate the PWA icons.

Placeholder art: a deep-forest circle with a simple sapling. Replace with the
real mark once Stitch produces one — regenerate by editing FOREST/LEAF below and
re-running. Kept as a script rather than committed binaries so the icon is
reproducible and matches the design tokens in app/src/index.css.

    python tools/make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "app" / "public"

# Kept in sync BY HAND with the @theme block in app/src/index.css. The icons are
# raster PNGs, so a palette change does not reach them until this is re-run —
# which is exactly how they were left showing the old dark green for a week.
FOREST = (20, 67, 44)  # --color-primary   #14432c
SPROUT = (127, 217, 180)  # --color-inverse-primary #7fd9b4
CREAM = (247, 246, 242)  # --color-surface  #f7f6f2


def draw_icon(size: int, maskable: bool) -> Image.Image:
    # Maskable icons get cropped to a circle by Android, so keep the artwork
    # inside the safe zone (the middle 80%) or the launcher will clip the leaves.
    img = Image.new("RGBA", (size, size), FOREST + (255,))
    d = ImageDraw.Draw(img)

    if not maskable:
        pad = size * 0.06
        d.rounded_rectangle(
            [pad, pad, size - pad, size - pad],
            radius=size * 0.22,
            fill=FOREST,
        )

    s = size * (0.62 if maskable else 0.72)
    cx, cy = size / 2, size / 2

    # Trunk
    trunk_w = s * 0.07
    d.rounded_rectangle(
        [cx - trunk_w / 2, cy - s * 0.05, cx + trunk_w / 2, cy + s * 0.42],
        radius=trunk_w / 2,
        fill=CREAM,
    )

    # Two leaves as ellipses angled off the trunk
    lw, lh = s * 0.34, s * 0.20
    for sign, colour in ((-1, SPROUT), (1, CREAM)):
        leaf = Image.new("RGBA", (int(lw), int(lh)), (0, 0, 0, 0))
        ImageDraw.Draw(leaf).ellipse([0, 0, lw - 1, lh - 1], fill=colour)
        leaf = leaf.rotate(sign * -28, expand=True, resample=Image.BICUBIC)
        img.alpha_composite(
            leaf,
            (
                int(cx + sign * s * 0.04 - (leaf.width / 2 if sign < 0 else 0)),
                int(cy - s * 0.28),
            ),
        )

    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        draw_icon(size, maskable=size == 512).save(OUT / f"icon-{size}.png")
        print(f"wrote {OUT / f'icon-{size}.png'}")

    # Apple touch icon — iOS ignores the web manifest for the home-screen icon.
    draw_icon(180, maskable=False).save(OUT / "apple-touch-icon.png")
    print(f"wrote {OUT / 'apple-touch-icon.png'}")

    # Favicon for the browser tab.
    draw_icon(64, maskable=False).save(OUT / "favicon.png")
    print(f"wrote {OUT / 'favicon.png'}")


if __name__ == "__main__":
    main()
