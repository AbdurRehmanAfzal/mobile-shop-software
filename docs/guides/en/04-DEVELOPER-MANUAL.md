# 04 — Developer Manual

How to work on the Mobile Shop SaaS codebase day to day: setup, workflow, rules, adding a feature end to end, testing, debugging, releasing.

Audience: a developer (human or AI assistant) joining the project. Read `CLAUDE.md` first; this manual expands it. If this manual and `CLAUDE.md` ever disagree, `CLAUDE.md` wins — and this file should be fixed.

Commands are shown for **PowerShell** (the default Windows terminal) and, where the syntax differs, **Git Bash**. Paths are relative to the repo root.

---

## Contents
1. [Prerequisites and first-time setup (Windows)](#1-prerequisites-and-first-time-setup-windows)
2. [Repo layout tour](#2-repo-layout-tour)
3. [Session workflow](#3-session-workflow)
4. [Hard rules, with examples](#4-hard-rules-with-examples)
5. [Adding a feature end to end (worked example)](#5-adding-a-feature-end-to-end-worked-example)
6. [Testing](#6-testing)
7. [Debugging and known gotchas](#7-debugging-and-known-gotchas)
8. [Release and deploy](#8-release-and-deploy)
9. [Conventions](#9-conventions)
10. [Troubleshooting FAQ](#10-troubleshooting-faq)

---

## 1. Prerequisites and first-time setup (Windows)

### 1.1 Install
| Tool | Version | Why |
|---|---|---|
| Python | **3.12** exactly (`requires-python = ">=3.12,<3.13"`) | backend |
| Node.js | **22** (what CI uses) | frontend |
| Git for Windows | any recent | includes Git Bash |
| Docker Desktop | optional | local PostgreSQL, running the production stack |
| Android Studio | optional | only for local APK builds; CI builds the APK without it |

Check: `py -3.12 --version`, `node --version`, `git --version`.

### 1.2 `PYTHONUTF8=1` — always
Windows Python defaults to the cp1252 code page for console output and file reads. Urdu text (seed catalogue names, error messages, printed receipts) and emoji then crash with `UnicodeEncodeError`. Set it in every terminal before running Python:

```powershell
# PowerShell, this terminal only
$env:PYTHONUTF8 = "1"
# or permanently for new terminals
setx PYTHONUTF8 1
```
```bash
# Git Bash
export PYTHONUTF8=1
```
```bat
:: cmd.exe (as in CLAUDE.md)
set PYTHONUTF8=1
```
The backend Docker image and CI already set it.

### 1.3 Backend
```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -e ".[dev]"          # app + pytest, httpx, hypothesis, ruff
copy .env.example .env                          # then edit, see 1.4
$env:PYTHONUTF8 = "1"
.venv\Scripts\alembic upgrade head              # creates/updates backend/mobile_shop_v2.db (SQLite)
.venv\Scripts\uvicorn app.main:app --reload --reload-dir app --port 8000
```
Git Bash equivalent: replace `.venv\Scripts\x` with `.venv/Scripts/x` and `copy` with `cp`.

Optional extra for PostgreSQL work: `.venv\Scripts\pip install -e ".[dev,postgres]"` (installs `psycopg`).

Check it runs: open http://localhost:8000/health and the API docs at http://localhost:8000/docs (`/docs` is hidden when `APP_ENV=prod`).

On startup the app seeds the global phone catalogue and expense categories (idempotent, safe on every start).

### 1.4 Backend `.env` for local development
`backend/.env` is git-ignored. Start from `backend/.env.example`; every value is optional and defaults suit local development. Two keys matter locally:

```ini
APP_ENV=dev
DATABASE_URL=sqlite:///./mobile_shop_v2.db
SECRET_KEY=change-me-to-a-long-random-string
# Only the product owner opens shops in production. Locally ON so tests/e2e can create throwaway shops.
PUBLIC_SIGNUP=true
# Super users (comma separated) see More > Super admin.
# 03001234567 = placeholder for your own test login; 03990000099 = the e2e super user used by e2e/admin.spec.ts
SUPERUSER_PHONES=03001234567,03990000099
```
- Never put the real owner's login number, production passwords or keys in docs, tests or commits.
- `PUBLIC_SIGNUP=true` is a dev/test setting only. Production keeps it `false` (ADR-012).
- To point the dev server at PostgreSQL: `DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/mobileshop` (needs the `postgres` extra).

### 1.5 First login locally
With `PUBLIC_SIGNUP=true`, open http://localhost:5173/signup and create a shop. Alternatively use the same CLI as production:
```powershell
cd backend
$env:PYTHONUTF8 = "1"
.venv\Scripts\python -m app.cli create-owner     # asks shop, name, mobile, password (not echoed)
```

### 1.6 Frontend
```powershell
cd frontend
npm install
npm run dev            # http://localhost:5173 ; /api and /health are proxied to :8000
```
Three dev-server modes (`frontend/package.json`):

| Script | URL | Use |
|---|---|---|
| `npm run dev` | `http://localhost:5173` | normal work, Playwright |
| `npm run dev:lan` | `http://<PC-IP>:5173` | a phone on the same Wi-Fi (plain http) |
| `npm run dev:phone` | `https://<PC-IP>:5174` | phone with **live camera** (IMEI scan). Self-signed certificate; accept the browser warning once |

Why `dev:phone` exists: a phone browser opens the camera inside the page only on a secure context (https or localhost). On the http LAN link Android opens the separate camera app and Chrome may reload the page (state lost). `dev:phone` adds `@vitejs/plugin-basic-ssl` (vite `--mode phone`).

Find the PC's IP with `ipconfig` (IPv4 of the Wi-Fi adapter). Only the Vite port must be reachable — Vite proxies `/api` to `localhost:8000`, so port 8000 does not need to be opened.

**Windows Firewall:** the first time Node listens on the LAN Windows asks; allow it on **Private** networks. If you dismissed the prompt, allow the ports in an admin PowerShell (one option; adjust to your policy):
```powershell
New-NetFirewallRule -DisplayName "Vite dev (mobileshop)" -Direction Inbound -Protocol TCP -LocalPort 5173,5174 -Action Allow -Profile Private
```

### 1.7 Playwright browsers (once)
```powershell
cd frontend
npx playwright install chromium
```

---

## 2. Repo layout tour

```
CLAUDE.md                 project context + hard rules (read first)
README.md                 doc index
docs/                     living docs 01..14, guides/, archive/ (v1 docs)
backend/                  FastAPI v2
frontend/                 React + Vite + TS + Tailwind PWA, Capacitor Android in frontend/android
deploy/                   docker-compose, Dockerfile for web, deploy.sh, backup.sh, setup-vps.sh, ci/
.github/workflows/        ci.yml, deploy.yml, android.yml
.claude/skills/           kickoff, handoff, pk-mobile-domain
legacy/                   v1 prototype — reference only, never extend (docs/08)
```

### 2.1 Backend (`backend/`)
```
pyproject.toml            deps, pytest + ruff config (line length 100, py312)
alembic.ini, alembic/     migrations (file name = <rev>_<slug>.py); env.py uses batch mode on SQLite
app/
  main.py                 create_app(): CORS, error handlers, /health, include_router(...) for every module
  cli.py                  python -m app.cli create-owner
  core/
    config.py             Settings (pydantic-settings, reads .env)
    errors.py             AppError + NotFound/Unauthorized/Forbidden/Conflict/ValidationFailed
    tenancy.py            CurrentContext (user + active shop), Ctx, DB, require_cap(...)
    permissions.py        Role, Cap, role → capabilities
    security.py           JWT, bcrypt
    pk.py                 Pakistani helpers (phone normalisation, CNIC, IMEI Luhn…)
    ratelimit.py
  db/
    base.py               Base, UUIDPk, Timestamped, ShopScoped, Money = Numeric(14,2), ZERO
    models.py             imports every module's models (Alembic + metadata see all tables)
    session.py            engine, SessionLocal, get_db
  modules/<name>/         one folder per domain module
    models.py             SQLAlchemy models
    schemas.py            Pydantic in/out models
    service.py            business logic (tenancy checks, Decimal, ledger posting, device events, commit)
    router.py             thin FastAPI routes: auth/capability deps → service call
  seeds/catalogue.py      brands/models/storages/colours (idempotent)
tests/                    pytest; conftest.py = fixtures (client, owner, other_owner, cat, signup, login)
```
Modules today: accessories, admin, audit, auth, catalogue, devices (+ `state.py` state machine), exchanges, expenses, exports, files, ledger (PostingService), loans, notifications, parties, payments, purchases, repairs, reports, returns, sales, verification.

Rule of thumb: **routers stay thin**, all rules live in `service.py`, so tests and other services can reuse them.

### 2.2 Frontend (`frontend/`)
```
src/
  main.tsx                providers (react-query, i18n, router)
  app/router.tsx          all routes;  app/Shell.tsx  header, bottom tabs (phone), side menu + F-keys (laptop)
  components/
    Bilingual.tsx         BiLabel, BiButton, BiInput, BiAlert, BiSegmented, useLang()
    ui.tsx                PageHeader, Sheet, Row, List, MoneyText, BalanceLabel, Chip, SearchBox, Empty,
                          Loading, ErrorText, Section, KV, Stepper, IconChip, BtnText, fmtDate…
    PartyPicker, AccessoryPicker, ScanButton, RemoveSheet, DownloadButton, FieldInputs
  features/<module>/      pages per module (counter = home/hisaab/khata, sale, purchase, stock, …)
  lib/
    api.ts                fetch wrapper (auth header, X-Shop-Id, refresh, ApiError)
    queries.ts            TanStack Query hooks; keys start with the active shop id
    auth.ts, theme.ts     zustand stores
    draft.ts              useDraft (form state that survives a reload)
    id.ts                 uid() — works without crypto.randomUUID (http LAN)
    scan.ts, format.ts, files.ts, types.ts
  i18n/index.ts           i18next setup, setLocale(), both(key)
  i18n/locales/           en.json, ur.json, roman.json  (same keys in all three)
  index.css               design tokens (CSS variables) per look/theme
e2e/                      Playwright specs + fixtures/ (barcode images, fake camera stream)
android/                  Capacitor Android project (build.gradle, signing from env)
capacitor.config.ts, vite.config.ts, playwright.config.ts, tailwind.config.js, tsconfig.json (strict)
```

### 2.3 Deploy and CI
```
deploy/docker-compose.yml   db (postgres 16) + backend + web (Caddy) behind the VPS's Traefik
deploy/web.Dockerfile       builds the React app into a Caddy image (Caddyfile proxies /api, /health)
deploy/deploy.sh            runs on the VPS: pull tag → up → health check → keep or roll back
deploy/backup.sh            nightly pg_dump + uploads tarball, 14 days
deploy/setup-vps.sh         one-time server setup
deploy/ci/                  compose.ci.yml + smoke.sh (CI "stack" job)
deploy/.env.example         keys of the server .env (no values)
```

### 2.4 Docs you will touch most
| File | When |
|---|---|
| `docs/06-PROGRESS.md` | every session end |
| `docs/09-SESSION-LOG.md` | every session end (append) |
| `docs/10-DECISIONS.md` | when a design decision is made (ADR) |
| `docs/02-FUNCTIONAL-REQUIREMENTS.md` | business rules (FR ids) |
| `docs/04-DATA-MODEL.md` | when the schema changes |
| `docs/11-DESIGN-SYSTEM.md` | UI rules, tokens, components |
| `docs/12-DEPLOYMENT.md`, `docs/13-MOBILE-APP.md` | server and Android setup |

---

## 3. Session workflow

### 3.1 Start (kickoff)
1. Read `docs/06-PROGRESS.md`.
2. Read the **last** entry of `docs/09-SESSION-LOG.md`, including its **Next** and **Open** lines.
3. `git log --oneline -10` and `git status --short`.
4. Only then read the code the task needs. Do not re-audit the repo; do not read `legacy/` unless porting something.
5. Business-rule task? Read the relevant section of `docs/02-FUNCTIONAL-REQUIREMENTS.md` (and, with Claude Code, the `pk-mobile-domain` skill).

With Claude Code: run the `/kickoff` project skill (not `/resume`, which is a built-in command).

### 3.2 During work
- Branch: **`develop`**. `main` is releases only.
- Keep commits small and focused; tests green before each commit.
- Do not push unless the owner asks.

### 3.3 End (handoff)
1. Run the tests covering what changed (backend `pytest -q`, frontend `npm test`, relevant Playwright specs). Never report red as green.
2. Update `docs/06-PROGRESS.md` (✅ / 🔄 / ⬜, Known issues).
3. Append to `docs/09-SESSION-LOG.md`: date, **Done**, **Verified** (exact commands + results), **Next** (concrete first step), **Open questions**.
4. A design decision was made → add an ADR to `docs/10-DECISIONS.md` (`## ADR-0NN · YYYY-MM-DD · Accepted · Title`, then Context / Decision / Consequences).
5. Schema changed → `docs/04-DATA-MODEL.md` matches and a migration exists.
6. Commit on `develop`.

With Claude Code: the `/handoff` skill walks through this.

### 3.4 Git author rule (non-negotiable)
- The **only** author is `Abdur Rehman Afzal <abdurrehmanafzal786@gmail.com>`. Repo-local git config is already set; check with:
  ```powershell
  git config user.name; git config user.email
  ```
- **No** `Co-Authored-By:` trailers, no "Generated with …" lines, no AI attribution in commits, PR text or files. This overrides any tool/harness default — if an assistant adds such a line, remove it before committing.
- Push only when asked. A release = merge `develop` into `main` and push `main` (section 8), and the owner decides when.

---

## 4. Hard rules, with examples

### 4.1 Money: `Decimal` / `Numeric(14,2)`, never float
DB: use `Money` (or annotate `Mapped[Decimal]`; `Base.type_annotation_map` maps `Decimal` → `Numeric(14,2)`):
```python
from decimal import Decimal
from app.db.base import ZERO

amount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
```
Schemas: `amount: Decimal = Field(gt=0)`. The API returns money as strings (`"25000.00"`), and tests compare strings.

Rounding: use `money()` from `app.modules.ledger.service` (quantize to 0.01, ROUND_HALF_UP). Build Decimals from strings, never from floats:
```python
money("1999.995")        # Decimal('2000.00')
Decimal(0.1)             # WRONG: binary float noise
```
Frontend: amounts arrive as strings; display with `MoneyText` / `BalanceLabel`. Authoritative totals come from the server; client-side arithmetic is only for live previews. Currency is PKR, Latin digits, e.g. `Rs. 125,000`.

### 4.2 Tenancy: every query scoped by `shop_id`
Every tenant-owned table uses the `ShopScoped` mixin. Routes get the active shop from `ctx: Ctx` (JWT + `X-Shop-Id` header, validated in `core/tenancy.py`) and pass `ctx.shop_id` to the service. The service filters **explicitly**:
```python
# list
stmt = select(Expense).where(Expense.shop_id == shop_id)

# get by id: a row from another shop is "not found", never "forbidden" (no enumeration)
def get_expense(db, shop_id, expense_id):
    e = db.get(Expense, expense_id)
    if e is None or e.shop_id != shop_id:
        raise NotFound(code="expense_not_found")
    return e

# any foreign id coming from the client must belong to the same shop
if data.party_id and (p := db.get(Party, data.party_id)) is not None and p.shop_id != shop_id:
    raise NotFound(code="party_not_found")
```
Global rows (seeded catalogue, built-in expense categories) have `shop_id = NULL` and are read with `or_(X.shop_id.is_(None), X.shop_id == shop_id)`; shops can only edit their own rows.

Every new endpoint gets a leakage test using the `owner` and `other_owner` fixtures (see `tests/test_tenancy.py`).

Note: `docs/03-ARCHITECTURE.md` mentions `with_loader_criteria`; the actual code uses the explicit pattern above — follow the code.

### 4.3 Ledger is append-only
All money movement goes through the PostingService (`app/modules/ledger/service.py`):
```python
from app.modules.ledger.service import Posting, post, reverse

posting = (
    Posting(document_type="expense", document_id=e.id, memo="October rent")
    .debit("expense:rent", amount)
    .credit("cash", amount, cash_account_id=cash.id)
)
group = post(db, shop_id, user_id, posting)   # refuses unbalanced groups (debit total != credit total)
```
- Never `UPDATE` or `DELETE` a `ledger_entries` row. Balances (party balance, cash in hand, statements) are **derived** from entries.
- Corrections = a reversing group: `reverse(db, shop_id, user_id, group_id, reason)`, then post the corrected document if needed. Example: voiding an expense calls `reverse(...)` and sets the expense's `status`/`void_reason`.
- Balance sign: positive = party owes the shop ("lena hai"), negative = shop owes the party ("dena hai").

### 4.4 Device events are immutable
Every device change (purchase, sale, loan out/back, return, repair in/out, verification…) is a new `device_events` row written through `apply_event(...)` in `app/modules/devices/service.py`; the device's `status` is a projection checked by the state machine in `devices/state.py` (`next_status`). Illegal transitions raise `InvalidTransition`.
```python
apply_event(db, shop_id, user_id, device, EventType.SOLD,
            party_id=customer.id, amount=price, ledger_group_id=group.id,
            document_type="invoice", document_id=inv.id)
```
Never edit or delete event rows; the device history screen is built from them. A phone bought again keeps the same `devices` row (new cycle, more events), never a duplicate.

### 4.5 Errors: code + English + Urdu
Raise `AppError` subclasses with a stable `code`; give specific messages in both languages when the default is too generic:
```python
raise ValidationFailed(
    code="party_required",
    message_en="Select who is taking the device",
    message_ur="کون لے کر جا رہا ہے، منتخب کریں",
)
```
Response body: `{"error": {"code", "message_en", "message_ur", "details"}}`. The UI shows the one matching the current language (Roman mode shows English, ADR-010).

### 4.6 UI: one language at a time, all strings in i18n
- Urdu mode = only Urdu (Nastaliq, RTL). English mode = only English. Roman Urdu mode = only Roman (LTR). **Never stack EN + UR.**
- Every user-visible string is a key in **all three** files: `en.json`, `ur.json`, `roman.json`. No hard-coded text in components.
- Numbers always Latin digits; wrap numbers in `.num` (or use `MoneyText`) so Nastaliq never draws `0` as a dot.
- Use shop words, not accounting words (udhaar, lena/dena, "stock daalein", "ID card check").
- Printed documents and notifications follow `shops.default_locale`, overridable with `?lang=en|ur`.

### 4.7 Design system only — premium look
- Build screens only from the design-system components (`Bi*` in `Bilingual.tsx`, primitives in `ui.tsx`, shared pickers) on the CSS tokens in `index.css` (`docs/11-DESIGN-SYSTEM.md`, default look "Modern", ADR-011).
- No emoji icons (use `lucide-react`), no default-blue buttons, no bare white cards.
- **Every action looks like a button and has an icon; no icon without words** (`BiButton icon=…`, `IconChip`, `BtnText`). Tappable cards show "See details ›" (`SeeMore`).
- Tap targets ≥ 44px, main actions 56–64px; at most three steps for daily jobs.
- Never use colour alone for meaning: amounts also say "lene hain / dene hain".
- Check dark mode: `bg-ink` flips to light in dark mode — use `bg-hero` for dark hero cards.

Note: the `pk-mobile-domain` skill still mentions stacked English + Urdu labels; that line is outdated — the one-language rule in `CLAUDE.md` wins.

### 4.8 Tests for business logic
Ledger, balances, the device state machine, tax, numbering and tenancy get backend tests before the UI. A P0 FR has at least one test naming the FR id in its docstring (e.g. `"""FR-TXN-09, FR-TXN-10: …"""`).

---

## 5. Adding a feature end to end (worked example)

Example: **an expense gets an optional "bill / receipt number"** (`bill_ref`), typed on the New expense sheet and shown on the expense. Small, but it touches every layer. (Illustrative — the field does not exist in the code.)

### 5.1 Model
`backend/app/modules/expenses/models.py`, inside `class Expense`:
```python
bill_ref: Mapped[str | None] = mapped_column(String(40))  # shop's own bill / receipt number
```
New table? Use `UUIDPk, ShopScoped, Timestamped, Base`, money as `Mapped[Decimal]`, and import the module in `app/db/models.py` if it is a new module.

### 5.2 Alembic migration
```powershell
cd backend
$env:PYTHONUTF8 = "1"
.venv\Scripts\alembic upgrade head                                   # DB must be at head first
.venv\Scripts\alembic revision --autogenerate -m "expenses bill_ref"
```
This creates `alembic/versions/<rev>_expenses_bill_ref.py`. **Always review it** — autogenerate is a draft:
- Put a one-line docstring on top saying what and why, like the existing files (`"""purchases.purchased_at: when the phone was actually bought`).
- `env.py` renders **batch mode on SQLite** (`render_as_batch=settings.is_sqlite`), because SQLite cannot `ALTER` most things. Keep `op.batch_alter_table(...)` blocks; they also work on PostgreSQL.
- **Name every constraint.** Autogenerate leaves FK names `None` in downgrades (`# WARNING: constraint name is None`) — fill in the exact name used in `upgrade()`.
- Adding a `NOT NULL` column to an existing table needs a `server_default` (SQLite batch copy and existing rows).
- Remove noise autogenerate may add (type comparisons you did not intend).

Result for this example:
```python
"""expenses.bill_ref: the shop's own bill / receipt number

Revision ID: <rev>
Revises: <previous head>
"""

def upgrade() -> None:
    op.add_column("expenses", sa.Column("bill_ref", sa.String(length=40), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("expenses") as batch:
        batch.drop_column("bill_ref")
```
**Test the downgrade too**, not just the upgrade:
```powershell
.venv\Scripts\alembic downgrade -1
.venv\Scripts\alembic upgrade head
```
Real bug from this project: migration `ab0e2601f475` created an FK named `fk_accessories_accessory_id`, but its downgrade dropped `fk_invoice_lines_accessory_id`. SQLite's batch mode rebuilds the table and silently passed; **only PostgreSQL** (CI's up/down/up job) caught it. The fix kept the original (typo'd) name, because databases already had it. Lesson: copy constraint names from `upgrade()` into `downgrade()`, and run up/down/up on PostgreSQL before releasing (6.3).

`tests/test_migrations.py` also checks that `alembic upgrade head` produces exactly the tables and columns of the models — if you forget the migration, it fails.

### 5.3 Schemas
`backend/app/modules/expenses/schemas.py`:
```python
class ExpenseCreate(BaseModel):
    ...
    bill_ref: str | None = Field(default=None, max_length=40)

class ExpenseOut(BaseModel):
    ...
    bill_ref: str | None = None
```

### 5.4 Service
`backend/app/modules/expenses/service.py`, in `create_expense` (already tenancy-checked, Decimal amounts, ledger posting):
```python
e = Expense(
    shop_id=shop_id,
    ...,
    bill_ref=(data.bill_ref or "").strip() or None,
)
```
If the field had a rule (e.g. unique per shop), enforce it here with a bilingual error:
```python
raise Conflict(code="bill_ref_exists",
               message_en="This bill number is already saved",
               message_ur="یہ بل نمبر پہلے سے محفوظ ہے")
```
Make sure `to_out()` includes the new field. Services `db.commit()` at the end of a successful write.

### 5.5 Router
Nothing to change here — the route already passes `ExpenseCreate` to the service. For a **new endpoint**:
```python
@router.get("/by-bill/{bill_ref}", response_model=ExpenseOut)
def by_bill(bill_ref: str, ctx: Exp, db: DB):          # Exp = Ctx + require_cap(Cap.EXPENSES)
    return service.to_out(db, service.get_by_bill(db, ctx.shop_id, bill_ref))
```
- Pick the right dependency: `Ctx` (any logged-in member of the shop) or `Annotated[Ctx, Depends(require_cap(Cap.X))]`.
- Declare fixed paths (`/by-bill/...`, `/day-close`) **before** `/{id}` routes.
- A new module's router must be added in `app/main.py` (`app.include_router(...)`).
- **Restart uvicorn** after adding routes (section 7.1).

### 5.6 Backend tests
In `backend/tests/test_expenses.py`:
```python
def test_expense_keeps_bill_ref(db, owner, other_owner):
    seed_categories(db)
    rent = next(c for c in owner.get("/api/v1/expenses/categories").json() if c["key"] == "rent")
    r = owner.post("/api/v1/expenses",
                   json={"category_id": rent["id"], "amount": "1500", "bill_ref": " B-17 "})
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["bill_ref"] == "B-17" and e["amount"] == "1500.00"
    # another shop cannot see it
    assert other_owner.get(f"/api/v1/expenses/{e['id']}").status_code == 404
```
Run: `.venv\Scripts\pytest -q tests/test_expenses.py`, then the whole suite and `ruff check app tests`.

### 5.7 Frontend data
Simple screens use the generic hooks in `src/lib/queries.ts`:
```ts
const { data } = useGet<Expense[]>(['expenses'], '/api/v1/expenses')          // key is prefixed with the shop id
const create = useDocMutation<Record<string, unknown>, Expense>('POST', () => '/api/v1/expenses')
```
`useDocMutation` invalidates all of the shop's queries on success (documents touch many lists). For data used on several screens, add a named hook in `queries.ts` and the type in `lib/types.ts`. Add `bill_ref: string | null` to the `Expense` interface.

### 5.8 UI with design-system components
In `features/expenses/ExpensesPage.tsx` (New expense sheet):
```tsx
<BiInput label="expense.billRef" value={billRef} onChange={(e) => setBillRef(e.target.value)} />
...
create.mutate({ category_id: catId, amount, description: desc, bill_ref: billRef || null })
```
and on the detail: `<KV k="expense.billRef" v={current.bill_ref ?? '—'} />`.
Labels take an **i18n key** (or a `{en, ur, roman}` object); never a literal English string. Errors: `<ErrorText error={create.error} />`.

If a field is cleared with backspace, keep "untouched" and "cleared" apart (`null` vs `''`). A past bug: `value={refund === '' ? paidFor : refund}` refilled the box every time it was emptied.

Long multi-step forms that may trigger the camera use `useDraft(key, initial)` instead of `useState` so an Android reload does not lose the entry; call `clearDrafts(prefix)` after saving.

### 5.9 i18n keys in all three locales
Add the same key under the same namespace in each file:
```jsonc
// en.json      "expense": { …, "billRef": "Bill number" }
// ur.json      "expense": { …, "billRef": "بل نمبر" }
// roman.json   "expense": { …, "billRef": "Bill number" }
```
- Never reuse a key that is already an object namespace (adding `stock.condition` as a string wiped the `stock.condition.*` labels once). Use a new name (`stock.conditionShort`).
- Keep Urdu in plain shop language; Roman is how shopkeepers type on WhatsApp.

### 5.10 Playwright spec
Extend `e2e/crud.spec.ts` or add `e2e/<feature>.spec.ts`. Pattern used in the suite: force English, sign up a throwaway shop with a random `039…` number, drive by label/role:
```ts
test('expense: bill number is kept', async ({ page }) => {
  await signup(page)                                   // helper as in crud.spec.ts
  await page.goto('/expenses')
  await page.getByRole('button', { name: 'New expense' }).click()
  await page.getByRole('button', { name: 'Tea & refreshments' }).click()
  await page.getByLabel('Amount').fill('500')
  await page.getByLabel('Bill number').fill('B-17')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('B-17')).toBeVisible()
})
```
If the screen is visible in Urdu, run `e2e/urdu.spec.ts`; it fails when English words leak into Urdu mode.

### 5.11 Docs
- `docs/04-DATA-MODEL.md` (new column), `docs/02` if a rule changed.
- `docs/06-PROGRESS.md`, `docs/09-SESSION-LOG.md` at handoff; ADR if a decision was made.

### 5.12 Checklist
- [ ] model + reviewed migration (up and down tested)
- [ ] schema in/out
- [ ] service: Decimal, `shop_id` checks, bilingual errors, ledger/events via the services
- [ ] router (+ `main.py` for new module), uvicorn restarted
- [ ] pytest incl. tenancy; ruff clean
- [ ] hook/type, UI from design-system components, icon + words
- [ ] keys in en/ur/roman
- [ ] Playwright spec; Urdu screenshot checked
- [ ] docs updated

---

## 6. Testing

### 6.1 Backend
```powershell
cd backend
$env:PYTHONUTF8 = "1"
.venv\Scripts\ruff check app tests                 # lint (CI runs exactly this)
.venv\Scripts\ruff check app tests --fix           # auto-fix (import order etc.)
.venv\Scripts\pytest -q                            # all tests, in-memory SQLite, fresh schema per test
.venv\Scripts\pytest -q tests/test_ledger.py       # one file
.venv\Scripts\pytest -q -k "void"                  # by name
.venv\Scripts\pytest -q -x --lf                    # stop at first failure, rerun last failures
```
Fixtures (`tests/conftest.py`): `client`, `db`, `owner` (signed-up shop, `Actor` with `.get/.post/.patch/.put/.delete` sending auth + `X-Shop-Id`), `other_owner` (second shop for leakage tests), `cat` (seeded catalogue + Nokia 105 refs), helpers `signup()` and `login()`.

IMEIs in tests must pass the Luhn check, e.g. `490154203237518`, `356938035643809`, `356789104552375`.

**Same tests on PostgreSQL** (`TEST_DATABASE_URL`; CI's stack is PG 16). Needs `pip install -e ".[dev,postgres]"` and a disposable database (all tables are dropped and recreated):
```powershell
# example with Docker (not verified on this PC); throwaway password
docker run -d --name ms-pg -e POSTGRES_USER=ms -e POSTGRES_PASSWORD=ms -e POSTGRES_DB=ms_test -p 5432:5432 postgres:16-alpine
$env:TEST_DATABASE_URL = "postgresql+psycopg://ms:ms@localhost:5432/ms_test"
.venv\Scripts\pytest -q
Remove-Item Env:TEST_DATABASE_URL
```

### 6.2 Frontend
```powershell
cd frontend
npm run typecheck          # tsc strict
npm test                   # vitest (src/**/*.test.ts(x), jsdom)
npx vitest run src/lib/scan.test.ts
npm run build              # tsc + vite production build
```

### 6.3 Migrations on PostgreSQL (what CI does)
```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://ms:ms@localhost:5432/ms_test"
.venv\Scripts\alembic upgrade head
.venv\Scripts\alembic downgrade base
.venv\Scripts\alembic upgrade head
Remove-Item Env:DATABASE_URL
```

### 6.4 Playwright (E2E)
Needs:
- the backend on **:8000** with `PUBLIC_SIGNUP=true` (specs sign up throwaway shops) and `03990000099` in `SUPERUSER_PHONES` (for `admin.spec.ts`);
- the frontend on **:5173** — Playwright starts `npm run dev` itself or reuses a running one.

```powershell
cd frontend
npm run e2e                                  # all specs
npx playwright test e2e/crud.spec.ts         # one file
npx playwright test -g "bill number"         # by test title
npx playwright test --headed                 # watch it
npx playwright show-report                   # after a failure (traces + screenshots kept on failure)
```
- One project, **Pixel 7** device (phone viewport). Laptop checks override the viewport inside the spec (`test.use({ viewport: { width: 1366, height: 820 }, isMobile: false, hasTouch: false })` in `counter.spec.ts`).
- `scan-live.spec.ts` feeds Chrome a fake camera (`e2e/fixtures/label-live.mjpeg`).
- `add-device.spec.ts` deletes `crypto.randomUUID` to behave like a phone on the http LAN.
- **Known flake:** `admin.spec.ts` ("super admin opens a shop") sometimes times out in the full run under load; it passes alone. Re-run it alone before investigating.
- Do not run two heavy Playwright suites on the PC at the same time.

### 6.5 What CI runs (`.github/workflows/ci.yml`)
On every push to `develop`, every PR, and before each release:
| Job | Steps |
|---|---|
| backend | `pip install -e ".[dev,postgres]"`, `ruff check app tests`, `pytest -q -p no:warnings` (SQLite), then `alembic upgrade head / downgrade base / upgrade head` on PostgreSQL 16 |
| frontend | `npm ci`, `npm run typecheck`, `npm test`, `npm run build` |
| stack | builds the production images, runs db + backend + web together, `deploy/ci/smoke.sh` (health, app page, deep link, signup, seeded catalogue, person, phone, report) |

Playwright is **not** in CI — run it locally after UI changes.

---

## 7. Debugging and known gotchas

### 7.1 New route returns 404 in the browser (uvicorn reloader)
On this PC the reloader repeatedly missed new routes, and once an orphan worker kept port 8000 with old code.
```powershell
netstat -ano | findstr :8000                     # more than one LISTENING PID = stale process
taskkill /PID <pid> /F
# find leftover uvicorn / multiprocessing-spawn python processes
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object CommandLine -match 'uvicorn|multiprocessing' | Select-Object ProcessId, CommandLine
Stop-Process -Id <pid> -Force
```
Then start again with `--reload-dir app`. Rule: **restart the backend after adding endpoints.**

### 7.2 New Tailwind classes or tokens do nothing
Restart Vite after changing `tailwind.config.js` (and when classes look stale after big changes). Kill old `node` / vite processes holding 5173 the same way (`netstat -ano | findstr :5173`).

### 7.3 Urdu rendering
- Nastaliq draws `0` as a dot → digits in `.num` (Manrope) or `MoneyText`.
- Nastaliq needs room: Urdu labels use `leading-[1.7]`; `leading-tight` clips Urdu.
- `.ur` and `html[lang=ur] body` use `Manrope, 'Noto Nastaliq Urdu'` so Latin letters/digits inside Urdu stay in Manrope.
- RTL: `setLocale('ur')` sets `dir="rtl"` on `<html>`. Use logical classes (`text-start`, `ps-*`, `me-*`, `start-*`) instead of left/right so layouts mirror correctly.
- Run `e2e/urdu.spec.ts` and look at its screenshots after UI work.

### 7.4 Phone-only bugs (http LAN)
`http://<PC-IP>:5173` is not a secure context: `crypto.randomUUID`, clipboard and in-page camera (`getUserMedia`) are missing. Use `uid()` from `lib/id.ts`, and provide fallbacks. Localhost and Playwright are secure contexts, so they hide this.

### 7.5 Android: page reload when the camera opens → `useDraft`
On the http link Android opens the camera app and Chrome may reload the page. Forms that might do this use `useDraft` (sessionStorage, 30 minutes). A draft is restored only on the page the browser itself reloaded, and only until the user navigates (`noteRoute` in Shell) — opening a form from the app always starts fresh.

### 7.6 Python/Pydantic
- A field named `date` in a module that also uses the `date` type breaks → `import datetime as dt`.
- `UnicodeEncodeError` / `charmap` codec errors → `PYTHONUTF8=1` missing.

### 7.7 Migrations
SQLite batch mode hides FK-name mistakes; PostgreSQL does not (5.2). `NOT NULL` add_column needs `server_default`.

### 7.8 Android build: Groovy call precedence (`frontend/android/app/build.gradle`)
Groovy's paren-less method calls bind tighter than you think:
```groovy
versionCode (System.getenv("APP_VERSION_CODE") ?: "1").toInteger()
// parsed as versionCode(...).toInteger()  -> versionCode receives a String
keyPassword System.getenv("ANDROID_KEY_PASSWORD") ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
// parsed as keyPassword(getenv(...)) ?: ...  -> the fallback is never passed
```
Fix (in the repo now): compute values first (`def appVersionCode = Integer.parseInt(...)`) or wrap the whole argument in parentheses: `keyPassword(a ?: b)`.

### 7.9 First deploy on a new domain: `curl` exit 60
Traefik issues the Let's Encrypt certificate on the first request; for a minute curl sees an invalid certificate (exit code 60). The deploy workflow's final check retries for 2 minutes. Wait and retry before suspecting the app.

### 7.10 Print / download in the Android app
Receipts and PDF/Excel/CSV downloads use the browser print dialog and downloads, which the WebView does not provide; they do nothing in the APK yet (docs/13 "Known gaps"). Test them on the website.

---

## 8. Release and deploy

One-time server and Android setup: `docs/12-DEPLOYMENT.md` and `docs/13-MOBILE-APP.md`. This section is the day-to-day.

### 8.1 Flow
```
develop  --push-->  CI (ci.yml)
main     --push-->  Deploy (deploy.yml): CI → images to ghcr.io (tag = commit sha + latest)
                    → ssh deploy@<vps> "sudo -n /opt/mobileshop/deploy.sh <sha>"
                      (pull → up -d → wait for /health → keep, or roll back to the previous tag)
                    → check APP_URL/health (retries 2 min)
         --push-->  Android (android.yml) when frontend/ changed: signed APK as a run artifact
```
Release (only when the owner says so):
```powershell
git checkout main
git pull
git merge develop
git push origin main
git checkout develop
```
Both workflows can also be started by hand: GitHub → Actions → Deploy / Android → Run workflow.

Migrations run automatically when the backend container starts (`alembic upgrade head` in `backend/Dockerfile`).

### 8.2 Android APK
- `android.yml`: `npm run build:native` (`vite build --mode native`, no service worker, `VITE_API_URL` = repo variable `APP_URL`, then `cap sync android`) → `gradlew assembleRelease`.
- Signing secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`. Without them a **debug-signed test APK** is built, which a later release-signed APK cannot update.
- Download the APK from the run page (artifact `mobile-shop-android-1.<run>`, kept 90 days). Version code = run number.
- The release keystore must sign every update forever; keep a backup off the server.

### 8.3 First login on a server
Signup is closed in production. On the VPS:
```bash
cd /opt/mobileshop && docker compose exec backend python -m app.cli create-owner
```
Use a number listed in `SUPERUSER_PHONES` in `/opt/mobileshop/.env` to get More → Super admin.

### 8.4 On the VPS
```bash
cd /opt/mobileshop
docker compose ps                          # status
docker compose logs --tail 100 backend     # logs (add -f to follow)
docker compose logs --tail 100 web
cat .current-tag                           # deployed commit
sudo /opt/mobileshop/deploy.sh <older-sha> # manual rollback to an earlier image tag
```
A rollback does **not** undo migrations. Rolling back across a schema change needs a database restore.

### 8.5 Backups and restore
Nightly 02:30 (`deploy/backup.sh`): `pg_dump` + uploads tarball to `/opt/mobileshop-backups`, 14 days kept. Copy them off the server regularly. Restore:
```bash
cd /opt/mobileshop
docker compose exec -T db pg_restore -U mobileshop -d mobileshop --clean < /opt/mobileshop-backups/db-YYYYMMDD-HHMM.dump
```
Do not touch the production server without the owner's go-ahead.

### 8.6 Run the production stack locally (optional)
The CI `stack` job, by hand (needs Docker; written for Linux/Git Bash, not verified on this Windows PC):
```bash
docker network create n8n_default          # Traefik's network, exists on the VPS
cd deploy
APP_DOMAIN=ci.localhost POSTGRES_PASSWORD=local-only SECRET_KEY=local-only-0123456789abcdef0123456789abcdef \
PUBLIC_SIGNUP=true IMAGE_PREFIX=mobileshop-ci IMAGE_TAG=local \
docker compose -f docker-compose.yml -f ci/compose.ci.yml up -d --build --wait db backend web
cd .. && bash deploy/ci/smoke.sh
```

---

## 9. Conventions

### 9.1 Code style
- **Python:** ruff, line length 100, target py312 (`pyproject.toml`). Type hints everywhere; SQLAlchemy 2 typed `Mapped[...]`; `import datetime as dt` when a field is named `date`. Routers thin, logic in services.
- **TypeScript:** `strict`, `noUnusedLocals`, `noUnusedParameters`; `@/` alias for `src/`. Function components + hooks; server state in TanStack Query, client state in zustand.
- **Names:** Python `snake_case`, modules plural (`expenses`); error codes `snake_case` (`category_not_found`); API under `/api/v1/<module>`; React components `PascalCase.tsx`, hooks `useX`; i18n keys `module.camelCase` (`expense.billRef`); test files `test_<module>.py`, `<feature>.spec.ts`.
- **Comments:** sparse. Module docstrings name the FR ids. Comment the *why* — especially owner decisions with a date (`# owner, 2026-10-26: ...`) and non-obvious bugs — not the what.

### 9.2 Commit messages
Conventional commits, short English, describing the visible result (see `git log --oneline -40`):
```
feat(frontend): expenses page - big 'New expense' and 'Close the day' buttons in the page
fix: migration downgrade used the wrong FK name (fails on PostgreSQL); smoke test checks every step
fix(android): gradle read the version and key password wrongly (Groovy call precedence)
ci: GitHub Actions CI and deploy to the OOP Solutions VPS behind Traefik (images on ghcr.io)
docs: session log - expenses page
style: import block in conftest
```
Types used: `feat`, `fix`, `docs`, `ci`, `style` (scope optional: `frontend`, `backend`, `android`, a module). Docs-only handoff commits are usually separate (`docs: session log - …`). No AI attribution lines (3.4).

### 9.3 Branch flow
- `develop`: all work; CI on every push.
- `main`: releases only (merge from `develop`; each push deploys).
- No push without the owner asking.

---

## 10. Troubleshooting FAQ

**`UnicodeEncodeError: 'charmap' codec can't encode…`** — `PYTHONUTF8=1` is not set in this terminal.

**`py -3.12` not found / wrong Python in venv** — install Python 3.12; delete `backend/.venv` and recreate it with `py -3.12 -m venv .venv`.

**Signup says "closed" (`signup_closed`, 403) locally** — set `PUBLIC_SIGNUP=true` in `backend/.env` and restart the backend.

**No "Super admin" in More** — your login number is not in `SUPERUSER_PHONES`; add it and restart the backend.

**`admin.spec.ts` fails** — is `03990000099` in `SUPERUSER_PHONES`? If yes and it only fails in the full run, it is the known flake; run it alone.

**API returns 404 for a route you just wrote** — reloader issue; kill stale processes and restart (7.1). Also check the router is in `main.py` and fixed paths come before `/{id}`.

**`no such column` / `table … has no column`** — run `alembic upgrade head`. Missing migration → `tests/test_migrations.py` fails too.

**`alembic revision --autogenerate` produces an empty or huge migration** — the DB was not at head before generating, or a new module's models are not imported in `app/db/models.py`.

**Downgrade fails on PostgreSQL but works on SQLite** — a constraint name differs between upgrade and downgrade (5.2).

**`X-Shop-Id` / `shop_required` / `shop_forbidden` errors** — the user belongs to several shops and the header is missing, or the shop id is not one of theirs.

**Frontend shows raw keys like `expense.billRef`** — the key is missing in that locale file, or you overwrote a namespace object with a string.

**English words in Urdu mode** — a hard-coded string or a missing `ur.json` key; `e2e/urdu.spec.ts` finds them.

**Phone cannot open `http://<PC-IP>:5173`** — same Wi-Fi? `npm run dev:lan` (not `dev`)? Firewall rule for Node / port 5173 on the Private profile?

**Camera opens the camera app and the form resets** — use `npm run dev:phone` (https :5174) for live scanning; forms must use `useDraft`.

**Button works on PC but does nothing on the phone** — a secure-context API (`crypto.randomUUID`, clipboard) on the http LAN; use `uid()` / fallbacks.

**Tailwind class has no effect** — restart Vite (7.2); check the token exists in `index.css` for the current look.

**Text unreadable in dark mode** — a token that flips (`bg-ink`) used as a dark background; use `bg-hero` and check every look.

**Deploy workflow: images ok, final check failed with curl exit 60** — certificate not issued yet on a new domain; wait and re-check `/health`.

**Deploy rolled back automatically** — the new version failed `/health`; `deploy.sh` printed the backend log. Read `docker compose logs --tail 200 backend` on the VPS (often a migration error).

**APK will not install over the previous one** — signed with a different key (debug vs release) or a lower version code; uninstall the old one or use the release key.

**Print/Download does nothing in the APK** — known gap (7.10); use the website.
