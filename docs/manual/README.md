# User manual (for shops that buy the software)

Owner request 2026-11-03: a detailed, module-wise user manual in English, Urdu and Roman Urdu,
with screenshots, to hand to every shop that buys Mobile Shop, and to print as a PDF.

| File | What it is |
|---|---|
| `en.md`, `ur.md`, `roman.md` | The manual text, one file per language (26 chapters, same structure in each) |
| `parts/<lang>-1..3.md` | The same text in three parts (chapters 1–8, 9–15, 16–26); `<lang>.md` is these joined |
| `img/<lang>/<name>.jpg` | Phone screenshots in that language, from a demo shop (list in `SHOTS.md`) |
| `Mobile-Shop-User-Manual-<lang>.pdf` | The finished A4 PDF: cover, contents, chapters, page numbers |
| `Mobile-Shop-User-Manual-<lang>.html` | The same as a web page (opens in a browser, needs the `img/` folder beside it) |

## Updating it

1. Edit `parts/<lang>-N.md` (the markdown is a small subset: `##` / `###` headings, paragraphs,
   single-level `-` / `1.` lists, tables, one-line `> **Tip:**` notes, `**bold**`, and
   `![Caption](shot:name)` for a screenshot; no HTML, no links, no nested lists).
2. Join the parts: `<lang>.md` = a `# ` title line + the three parts.
3. New screenshots (backend on :8000, frontend on :5173): from `frontend/`,
   `node scripts/manual-shots.mjs` (all languages; it makes a fresh demo shop each run).
   Retake only some: `ONLY=home,sale-done node scripts/manual-shots.mjs en,ur,roman`.
4. Build the PDFs: from `frontend/`, `node scripts/manual-pdf.mjs` (or `... ur` for one language).
   The Urdu PDF uses Noto Nastaliq Urdu from Google Fonts, so build it with internet on.
