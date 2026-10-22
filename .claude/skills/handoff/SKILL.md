---
name: handoff
description: End-of-session protocol for this project. Use before finishing a session, when the user says "bas", "aaj ke liye kafi", "commit kar do", "save progress", or whenever a meaningful chunk of work is complete, so the next session (or a context reset) loses nothing.
---

# Hand off the session

1. Run the tests that cover what changed (`backend: .venv\Scripts\pytest -q`, `frontend: npm test`). Report results honestly; do not hand off red tests as green.
2. Update `docs/06-PROGRESS.md`: tick finished items, mark 🔄 for partial ones, add new tech debt under "Known issues".
3. Append to `docs/09-SESSION-LOG.md`: date, **Done**, **Verified** (exact test commands and results), **Next** (concrete first step for the next session), **Open questions**.
4. If a design decision was made, add an ADR to `docs/10-DECISIONS.md`.
5. If schema changed, make sure `docs/04-DATA-MODEL.md` matches and an Alembic migration exists.
6. Commit on `develop` with a conventional message (`feat(devices): ...`, `docs: ...`). Author must be Abdur Rehman Afzal only; **no Co-Authored-By or AI attribution lines**. Do not push unless asked.
7. Tell the owner, in Roman Urdu, what was done, what was verified, and what is next.
