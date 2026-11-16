"""Make the landing page's screenshots light (owner 2026-11-16: "website loading time bohat lay rhi
hai"). Every public/landing/*.png becomes a .webp at the size the page really shows it — phone shots
540 px wide, laptop shots 1280 px — and the PNG is removed. `web-home-en` is also kept as a small
JPEG for the link preview (WhatsApp / Facebook do not all read WebP).

Run after `node scripts/landing-assets.mjs`, from frontend/:
    ../backend/.venv/Scripts/python scripts/landing-webp.py
"""

import pathlib

from PIL import Image

OUT = pathlib.Path(__file__).resolve().parents[1] / "public" / "landing"
PHONE_W, WEB_W, QUALITY = 540, 1280, 78

before = after = 0
for png in sorted(OUT.glob("*.png")):
    im = Image.open(png).convert("RGB")
    target = WEB_W if png.name.startswith("web-") else PHONE_W
    if im.width > target:
        im = im.resize((target, round(im.height * target / im.width)), Image.LANCZOS)
    webp = png.with_suffix(".webp")
    im.save(webp, "WEBP", quality=QUALITY, method=6)
    if png.stem == "web-home-en":
        im.save(OUT / "og-home.jpg", "JPEG", quality=80, optimize=True, progressive=True)
    before += png.stat().st_size
    after += webp.stat().st_size
    png.unlink()

print(f"{before / 1e6:.1f} MB of PNG -> {after / 1e6:.2f} MB of WebP")
