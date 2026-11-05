# Manuals

Owner requests 2026-11-03: a detailed user manual for shops that buy Mobile Shop (English, Urdu,
Roman Urdu, with screenshots, as PDF), then one for the super admin, one for developers setting the
software up, and our own operations runbook.

| Book | Source | PDF | For whom |
|---|---|---|---|
| User manual | `en.md`, `ur.md`, `roman.md` (parts in `parts/`) | `Mobile-Shop-User-Manual-<lang>.pdf` | Every shop that buys the software — give them this |
| Super admin manual | `admin-en.md`, `admin-roman.md` | `Mobile-Shop-Super-Admin-Manual-<lang>.pdf` | The owner / OOP Solutions staff who run the business side |
| Developer and setup manual | `developer-en.md` | `Mobile-Shop-Developer-Manual-en.pdf` | A developer or technical person setting it up or changing it |
| Operations runbook (internal) | `operations-en.md` | `Mobile-Shop-Operations-Manual-en.pdf` | Us: GitHub, releases, server, environment variables, every command, backups, fixes |

Each PDF also has an `.html` twin (opens in a browser with the `img/` folder beside it).

> The runbook names every secret and the server address only as placeholders (`<VPS_IP>`, `<SECRET_KEY>`)
> with where the real value is kept. Never write a real value into these files.

## Updating

1. Edit the markdown. It is a small subset: `##` / `###` headings, paragraphs, single-level
   `-` / `1.` lists, tables, one-line `> **Tip:**` notes, `**bold**`, `*italic*`, `` `code` ``, and
   `![Caption](shot:name)` for a screenshot. No HTML, no links, no nested lists, no code blocks.
2. The user manual is written in `parts/<lang>-1..3.md` (chapters 1–8, 9–15, 16–26);
   `<lang>.md` is a `# ` title line plus the three parts joined.
3. Screenshots (backend on :8000, frontend on :5173), from `frontend/`:
   `node scripts/manual-shots.mjs` (user manual, every language, a fresh demo shop each run;
   `ONLY=home,sale-done` retakes a few) and `node scripts/manual-admin-shots.mjs` (super admin, needs
   a number from `SUPERUSER_PHONES`). Pictures land in `img/<lang>/`; the list is in `SHOTS.md`.
4. PDFs, from `frontend/`: `node scripts/manual-pdf.mjs` builds every book, or name some:
   `node scripts/manual-pdf.mjs ur,admin-en`. The Urdu one needs internet for the Nastaliq font.
