# Mobile Shop SaaS (موبائل شاپ)

Bilingual (English + Urdu) mobile-shop management platform for Pakistan: new and **used** mobiles, device verification (CNIC, eGadget, PTA), full per-IMEI history across customers and shops, credit ledgers, repairs, accessories, expenses, FBR tax, reports, staff, multi-shop SaaS, offline local install, and Android/iOS apps.

Author: **Abdur Rehman Afzal**

## Documentation
| Doc | Purpose |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Project context and rules for AI-assisted development |
| [docs/guides/](docs/guides/README.md) | **Start here:** product overview, user manual, technical reference, developer manual, build journey (English + Roman Urdu) |
| [docs/01-BUSINESS-REQUIREMENTS.md](docs/01-BUSINESS-REQUIREMENTS.md) | Vision, problem, personas, business scenarios |
| [docs/02-FUNCTIONAL-REQUIREMENTS.md](docs/02-FUNCTIONAL-REQUIREMENTS.md) | Requirements by module with FR ids and priorities |
| [docs/03-ARCHITECTURE.md](docs/03-ARCHITECTURE.md) | Stack, tenancy, domain design, layouts |
| [docs/04-DATA-MODEL.md](docs/04-DATA-MODEL.md) | Tables, ledger, permissions |
| [docs/05-ROADMAP.md](docs/05-ROADMAP.md) | Phases 0–4 |
| [docs/06-PROGRESS.md](docs/06-PROGRESS.md) | Living progress tracker |
| [docs/07-TESTING.md](docs/07-TESTING.md) | Test strategy and definition of done |
| [docs/08-LEGACY-AUDIT.md](docs/08-LEGACY-AUDIT.md) | Findings on the v1 prototype and how to run it |
| [docs/09-SESSION-LOG.md](docs/09-SESSION-LOG.md) | Per-session handoff notes |
| [docs/10-DECISIONS.md](docs/10-DECISIONS.md) | Architecture decision records |

## Layout
```
backend/    FastAPI v2 (Python 3.12, SQLAlchemy 2, Alembic, pytest)
frontend/   React + Vite + TypeScript + Tailwind PWA
legacy/     v1 prototype (reference only)
docs/       documentation; docs/archive holds v1 docs
```

## Quick start
See "Running (v2)" in [CLAUDE.md](CLAUDE.md).

## Billing settings (placeholders you must replace)

The full checklist, with a stage-by-stage table for manual testing, is `docs/21-OWNER-SETUP-CHECKLIST.md`.

The subscription reminders (docs/19, docs/20) show the shopkeeper *your* payment details. They are
seeded with placeholders and are **hidden from shopkeepers until you replace them**:

1. Log in as the super admin → More → Super admin → **Fees** → **Billing settings**: bank name,
   account title, account number, IBAN, branch; support phone and WhatsApp; the reminder schedule
   (7 / 3 / 1 days before, grace 7 days, snooze 4 hours); an optional note per language.
   Wallets (Easypaisa, JazzCash, SadaPay…) are entered under **Accounts** on the same card.
2. Optional QR image: upload it with the files API (purpose `billing`) and put the path in
   `billing.qr_path` (the sheet does not upload it yet).
3. `backend/.env` on the server: `RENEWAL_PRIVATE_KEY` and `RENEWAL_PUBLIC_KEY` from
   `python -m app.modules.plan.renewal keygen`. Keep the private key only on the SaaS server; the
   public key goes into every install (also the Windows one-PC build). The pair in the developer's
   `.env` is for the development PC only.
4. `ADMIN_WHATSAPP` (or the first number in `SUPERUSER_PHONES`) receives the "fee proof submitted"
   message.

## Barcode scanners

Any USB or Bluetooth scanner in its default keyboard mode (code + Enter) works on every main
screen without a driver: Home (opens the phone), Sale (adds it with the asking price), Purchase
(fills IMEI 1 then IMEI 2), Return, Stock list and Stock count. Settings → Barcode settings has a
Test print and a Test scan box; `docs/23-BARCODES-PLAN.md` §6 walks through a real-scanner test.
Old stock: press "Barcodes for old stock" there once, or run `python -m app.modules.barcodes.backfill`.
