# 09 — Session Log

Newest entry at the bottom. Each entry: date · done · verified · next · open questions. Keep entries short; details belong in the other docs.

---

## 2026-10-22 — Session 1: clone, run v1, audit, plan v2
**Done**
- Cloned repo, ran v1 backend (Python 3.12 venv) and frontend (Vite); fixed Windows cp1252 crash with `PYTHONUTF8=1`; reseeded DB after partial seed.
- Audited v1 (docs/08). Decided to rebuild as v2 (ADR-001) reusing domain knowledge, seeds and bilingual components.
- Restructured repo: `legacy/` (v1 code), `docs/archive/` (v1 docs), new `docs/01–10`, `CLAUDE.md`, `.claude/skills/{resume,handoff,pk-mobile-domain}`.
- Wrote business requirements, functional requirements with FR ids, architecture, data model, roadmap, progress tracker, testing strategy.
- Set repo git author to Abdur Rehman Afzal; created branch `develop`.

**Verified**: v1 ran end-to-end (health, brands API, Vite 200). No v2 code yet, so no tests.

**Next**: Phase 0 backend skeleton → tenancy/auth → frontend skeleton (see docs/06).

**Open questions for the owner**
1. Cloud hosting preference (any VPS vs managed, e.g. Hetzner/DigitalOcean vs Railway/Render)? Affects Docker setup in Phase 3.
2. WhatsApp: is a Meta Business account available, or should we start with "share via WhatsApp" links (no API cost)?
3. Should Urdu be the default language on first launch? (Assumed yes.)
4. Trial length and plan prices (assumed 14 days; prices TBD).
