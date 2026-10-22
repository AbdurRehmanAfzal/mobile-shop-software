# 06 — Progress Tracker (living)

Legend: ✅ done · 🔄 in progress · ⬜ not started · ❌ blocked. Update this file at the end of every session.

## Phase 0 — Foundation
| Item | FR | Status | Notes |
|---|---|---|---|
| Repo restructure: legacy/, docs/, CLAUDE.md, skills | – | ✅ | 2026-10-22 |
| Legacy audit + continue/rebuild decision | – | ✅ | docs/08, ADR-001 |
| Business + functional requirements, data model, roadmap | – | ✅ | docs/01–05 |
| Backend skeleton (pyproject, settings, db base, alembic, pytest) | – | ✅ | `backend/`, 17 tests green |
| Organisations / shops / users models + migration | FR-AUTH-01..03 | ✅ | migration `30a7d2dc3b64` |
| Signup / login / refresh / me endpoints | FR-AUTH-01,02 | ✅ | `/api/v1/auth/*`, `/api/v1/me` |
| Permissions + shop scoping + leakage tests | FR-AUTH-03, tenancy | ✅ | `core/permissions.py`, `core/tenancy.py`, `tests/test_tenancy.py` |
| Staff create/update/disable, shops create/update | FR-AUTH-04 | ✅ | `/api/v1/staff`, `/api/v1/shops` |
| Audit log | FR-AUTH-06 | ✅ | `modules/audit`, `/api/v1/audit` |
| Catalogue module + seeds (brands/models/storages/colours, global + per-shop, Urdu names) | FR-MST-01,02 | ✅ | `modules/catalogue`, `seeds/catalogue.py` (17 brands, 108 models incl. feature phones), migration `7f4c986a8f9f`, 7 tests; seeds run at startup |
| Frontend skeleton (Vite TS, Tailwind, i18n, auth, shell) | FR-PLT-01 | ✅ | `frontend/`, BiLabel/BiButton/BiInput/BiAlert, login/signup, bottom-nav shell, 7 tests |
| Phase 0 exit demo on phone | – | 🔄 | Works in desktop browser (signup → Urdu dashboard). Not yet opened on a real phone; PWA service worker not added yet |
| Design system + reference mockup approved by owner | FR-PLT-08 | ✅ | Approved 2026-10-22: light default + dark/system toggle, emerald accent. docs/11 v1.0 |
| Design system implemented in frontend (tokens, theme toggle, primitives, shell, dashboard, auth, more) | FR-PLT-08 | ✅ | 9 frontend tests, build clean |

## Phase 1 — Used-mobile core
| Item | FR | Status | Notes |
|---|---|---|---|
| Parties module | FR-MST-03 | ✅ | `modules/parties`: one table, kinds[], per-shop phone uniqueness, CNIC/phone normalisation (Urdu digits ok), search by name/Urdu/phone/CNIC, `by-phone`, cached `balance` read-only; migration `975f04ac8e85`; 8 tests |
| Devices + events + state machine | FR-DEV-01..04 | ⬜ | |
| Device history + IMEI search | FR-DEV-05,06 | ⬜ | |
| Verification flow + declaration print | FR-VER-01..04 | ⬜ | |
| Ledger + PostingService + balances | FR-TXN-01,02 | ✅ | `modules/ledger`: cash_accounts (default Cash/نقد per shop), ledger_groups, ledger_entries; `Posting`/`post()`/`reverse()`; party balance cache refreshed from ledger; statements, cash book, opening balances; migration `6d403b33df28`; 11 tests incl. hypothesis property |
| Purchase (walk-in/supplier/shop) + device accessories | FR-TXN-03, FR-ACC-02 | ⬜ | |
| Sale + invoice numbering + receipt print | FR-TXN-04,12, FR-PRT-01 | ⬜ | |
| Payments + allocation + statement | FR-TXN-05 | ⬜ | |
| Loans (out/settle) | FR-TXN-06 | ⬜ | |
| Returns (sale/purchase) | FR-TXN-08 | ⬜ | |
| Scenario tests S1–S6 | – | ⬜ | |

## Phase 2 — Operations
| Item | FR | Status |
|---|---|---|
| Exchange | FR-TXN-07 | ⬜ |
| Accessories stock + pending tracker | FR-ACC-01,03,04 | ⬜ |
| Repairs | FR-REP-01..04 | ⬜ |
| Expenses, cash book, day close | FR-TXN-09,10 | ⬜ |
| Dashboard + reports + export | FR-RPT-01,02 | ⬜ |
| Tax | FR-TAX-01..03 | ⬜ |

## Phase 3 — SaaS and reach
| Item | FR | Status |
|---|---|---|
| Plans, multi-shop | FR-AUTH-05,07 | ⬜ |
| Staff polish, audit viewer | FR-AUTH-04,06 | ⬜ |
| WhatsApp / SMS / email + scheduled reports | FR-RPT-03,04,05 | ⬜ |
| PWA + Capacitor Android/iOS | FR-PLT-02,03 | ⬜ |
| Docker cloud deploy + local installer + backups | FR-PLT-04,06 | ⬜ |

## Phase 4 — Differentiators
| Item | FR | Status |
|---|---|---|
| AI assistant + OCR + pricing | FR-AI-01..04 | ⬜ |
| FBR POS | FR-TAX-04 | ⬜ |
| Cloud sync | FR-PLT-05 | ⬜ |

## Known issues / tech debt
- Frontend has no service worker yet (installable manifest only). Add `vite-plugin-pwa` in Phase 3.
- Signup has no phone OTP verification; add before public launch (Phase 3).
- No rate limiting on `/auth/login` yet; add middleware before cloud deploy.
- Dashboard tiles show zeros until the ledger/devices modules exist (Phase 1).
- Legacy issues are listed in docs/08 and are not being fixed.
