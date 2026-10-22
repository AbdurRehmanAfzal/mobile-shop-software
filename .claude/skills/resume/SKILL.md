---
name: resume
description: Start-of-session protocol for this project. Use at the beginning of every session, or when the user says "continue", "resume", "kahan thay", "wapis shuru karo", or before any coding task, to restore context from the progress tracker and session log without re-auditing the repo.
---

# Resume the project

1. Read `docs/06-PROGRESS.md` fully.
2. Read the **last** entry in `docs/09-SESSION-LOG.md` (and its open questions).
3. Run `git log --oneline -10` and `git status --short` to see uncommitted work.
4. State, in Roman Urdu, in 3–5 lines: where the project stands, what the previous session left as "next", and what you will do now. Then start.
5. Only read code that the task needs. Do not re-read `legacy/` unless porting something from it (seeds, components).
6. Remember the hard rules in `CLAUDE.md` (author, money as Decimal, shop_id scoping, append-only ledger/events, bilingual i18n, tests).
