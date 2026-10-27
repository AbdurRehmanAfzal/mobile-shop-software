# Mobile Shop SaaS (موبائل شاپ)

Bilingual (English + Urdu) mobile-shop management platform for Pakistan: new and **used** mobiles, device verification (CNIC, eGadget, PTA), full per-IMEI history across customers and shops, credit ledgers, repairs, accessories, expenses, FBR tax, reports, staff, multi-shop SaaS, offline local install, and Android/iOS apps.

Author: **Abdur Rehman Afzal**

## Documentation
| Doc | Purpose |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Project context and rules for AI-assisted development |
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
