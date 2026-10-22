# 10 — Architecture Decision Records

Format: ID · date · status · context · decision · consequences. Append only; supersede rather than edit.

## ADR-001 · 2026-10-22 · Accepted · Rebuild as v2 instead of extending v1
Context: v1 (see docs/08) lacks tenancy, auth, migrations, tests and uses float money with mutable balances and a half-done model refactor. The product must be multi-tenant SaaS with an immutable device history.
Decision: New codebase under `backend/` and `frontend/`; v1 moved to `legacy/` as reference. Reuse seeds, Urdu strings, bilingual component designs, and domain rules.
Consequences: Short-term slower (foundation first); long-term every feature lands on tenancy/ledger/events correctly. Legacy is never deployed.

## ADR-002 · 2026-10-22 · Accepted · Append-only ledger + append-only device events
Context: Balances and device status must always be explainable (shop disputes, audits).
Decision: Money moves only through `ledger_entries` grouped in balanced `ledger_groups`; device status only through `device_events`. Projections (`party balance`, `device.status`) are derived. Corrections are reversing entries.
Consequences: Slightly more code per document type (PostingService), but statements, cash book, P&L and history come from one source; enables offline sync later.

## ADR-003 · 2026-10-22 · Accepted · PostgreSQL for cloud, SQLite for local, same ORM
Context: SaaS needs scale and isolation; a shop PC without internet needs zero-ops.
Decision: SQLAlchemy 2 + Alembic targeting both; UUID keys; no DB-specific SQL outside a small compatibility layer. Row Level Security added on Postgres as a second wall.
Consequences: Avoid Postgres-only features in core paths; CI runs both.

## ADR-004 · 2026-10-22 · Accepted · One frontend codebase: React PWA, then Capacitor for Android/iOS
Context: Owner wants web, Android and iOS with a small team.
Decision: React + TypeScript PWA first; wrap with Capacitor for store builds and native camera/print/share.
Consequences: No React Native; native-only UX is limited to plugins. Revisit only if store-grade performance demands it.

## ADR-005 · 2026-10-22 · Accepted · WhatsApp Cloud API (Meta) over Twilio
Context: Twilio was in v1; cost and local reliability matter in Pakistan.
Decision: Abstract `Messenger` interface; first provider = Meta WhatsApp Cloud API, SMS via a local gateway; until API approval, use "share via WhatsApp" deep links.
Consequences: Needs Meta Business verification before Phase 3 messaging goes live.

## ADR-006 · 2026-10-22 · Accepted · Git authorship
Decision: All commits authored by Abdur Rehman Afzal only; no AI co-author trailers. Enforced via repo-local git config and CLAUDE.md.

## ADR-007 · 2026-10-22 · Accepted · Design direction "Emerald & Gold", light default with dark/system option
Context: v1 UI judged "not modern, not luxury" by ~50 shopkeepers (FR-PLT-08). Mockup of 5 screens reviewed by the owner.
Decision: Adopt Direction A (warm off-white ground, charcoal-green hero surfaces, emerald primary, gold for money). Light is the default; dark and system themes are user-selectable. Tokens live as CSS variables consumed by Tailwind; all UI is built from the bilingual primitives. No emoji icons; Lucide stroke icons.
Consequences: Every new screen must use the tokens and primitives; both themes must be checked for contrast when adding colours.
