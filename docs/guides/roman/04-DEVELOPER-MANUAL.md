# 04 — Developer Manual (Roman Urdu)

Is codebase par roz-marra kaam kaise karna hai: setup, workflow, rules, ek feature shuru se aakhir tak, testing, debugging aur release.

Kis ke liye: project mein aane wala developer (insaan ho ya AI assistant). Pehle `CLAUDE.md` parhein; yeh manual usi ko tafseel se samjhata hai. Agar kabhi yeh manual aur `CLAUDE.md` alag baat karein to `CLAUDE.md` sahi hai — aur yeh file theek karni hai.

Commands **PowerShell** (Windows ka default terminal) ke liye hain, aur jahan syntax mukhtalif hai wahan **Git Bash** ke liye bhi. Paths repo root se hain. English version: `docs/guides/en/04-DEVELOPER-MANUAL.md`.

---

## Fehrist
1. [Zaroori cheezein aur pehli dafa setup (Windows)](#1-zaroori-cheezein-aur-pehli-dafa-setup-windows)
2. [Repo ka naqsha](#2-repo-ka-naqsha)
3. [Session ka tareeqa](#3-session-ka-tareeqa)
4. [Pakke rules, misaalon ke saath](#4-pakke-rules-misaalon-ke-saath)
5. [Naya feature shuru se aakhir tak (misaal)](#5-naya-feature-shuru-se-aakhir-tak-misaal)
6. [Testing](#6-testing)
7. [Debugging aur maloom masle](#7-debugging-aur-maloom-masle)
8. [Release aur deploy](#8-release-aur-deploy)
9. [Conventions](#9-conventions)
10. [Masle aur hal (FAQ)](#10-masle-aur-hal-faq)

---

## 1. Zaroori cheezein aur pehli dafa setup (Windows)

### 1.1 Kya install karna hai
| Tool | Version | Kyun |
|---|---|---|
| Python | **3.12** hi (`requires-python = ">=3.12,<3.13"`) | backend |
| Node.js | **22** (CI yehi chalata hai) | frontend |
| Git for Windows | koi bhi naya | Git Bash saath aata hai |
| Docker Desktop | optional | local PostgreSQL, production stack chalana |
| Android Studio | optional | sirf local APK ke liye; CI is ke baghair APK bana deta hai |

Check: `py -3.12 --version`, `node --version`, `git --version`.

### 1.2 `PYTHONUTF8=1` — hamesha
Windows par Python console aur file ke liye cp1252 code page use karta hai. Urdu text (catalogue ke naam, error messages, receipts) aur emoji par `UnicodeEncodeError` aa kar program crash ho jata hai. Har terminal mein Python chalane se pehle set karein:

```powershell
# PowerShell, sirf is terminal ke liye
$env:PYTHONUTF8 = "1"
# ya naye terminals ke liye hamesha ke liye
setx PYTHONUTF8 1
```
```bash
# Git Bash
export PYTHONUTF8=1
```
```bat
:: cmd.exe (jaise CLAUDE.md mein)
set PYTHONUTF8=1
```
Backend ki Docker image aur CI mein yeh pehle se set hai.

### 1.3 Backend
```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -e ".[dev]"          # app + pytest, httpx, hypothesis, ruff
copy .env.example .env                          # phir edit karein, 1.4 dekhein
$env:PYTHONUTF8 = "1"
.venv\Scripts\alembic upgrade head              # backend/mobile_shop_v2.db (SQLite) banata/update karta hai
.venv\Scripts\uvicorn app.main:app --reload --reload-dir app --port 8000
```
Git Bash mein `.venv\Scripts\x` ki jagah `.venv/Scripts/x` aur `copy` ki jagah `cp` likhein.

PostgreSQL par kaam ke liye: `.venv\Scripts\pip install -e ".[dev,postgres]"` (`psycopg` aa jata hai).

Chal raha hai? http://localhost:8000/health aur API docs http://localhost:8000/docs kholein (`APP_ENV=prod` mein `/docs` chhupa hota hai).

Start hote waqt app global phone catalogue aur kharche ki categories seed karti hai (har start par mehfooz, dobara nahi banti).

### 1.4 Local ke liye backend `.env`
`backend/.env` git mein nahi jati. `backend/.env.example` se shuru karein; sab values optional hain aur default local ke liye theek hain. Local mein do keys ahem hain:

```ini
APP_ENV=dev
DATABASE_URL=sqlite:///./mobile_shop_v2.db
SECRET_KEY=change-me-to-a-long-random-string
# Production mein dukaan sirf product owner kholta hai. Local mein ON taake tests/e2e aarzi dukanein bana sakein.
PUBLIC_SIGNUP=true
# Super users (comma se alag) ko More > Super admin dikhta hai.
# 03001234567 = apne test login ka placeholder; 03990000099 = e2e/admin.spec.ts wala e2e super user
SUPERUSER_PHONES=03001234567,03990000099
```
- Asal owner ka login number, production passwords ya keys kabhi docs, tests ya commits mein na daalein.
- `PUBLIC_SIGNUP=true` sirf dev/test ke liye hai. Production mein yeh `false` rehta hai (ADR-012).
- Dev server ko PostgreSQL par chalana ho: `DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/mobileshop` (`postgres` extra chahiye).

### 1.5 Local mein pehla login
`PUBLIC_SIGNUP=true` ho to http://localhost:5173/signup khol kar dukaan banayein. Ya production wala CLI chalayein:
```powershell
cd backend
$env:PYTHONUTF8 = "1"
.venv\Scripts\python -m app.cli create-owner     # dukaan, naam, mobile, password poochta hai (password screen par nahi dikhta)
```

### 1.6 Frontend
```powershell
cd frontend
npm install
npm run dev            # http://localhost:5173 ; /api aur /health :8000 par proxy hote hain
```
Dev server ke teen mode (`frontend/package.json`):

| Script | URL | Kab |
|---|---|---|
| `npm run dev` | `http://localhost:5173` | aam kaam, Playwright |
| `npm run dev:lan` | `http://<PC-IP>:5173` | usi Wi-Fi par phone (sada http) |
| `npm run dev:phone` | `https://<PC-IP>:5174` | phone par **live camera** (IMEI scan). Self-signed certificate; browser ki warning ek dafa accept karein |

`dev:phone` kyun: phone ka browser page ke andar camera sirf secure context (https ya localhost) par kholta hai. http LAN link par Android alag camera app kholta hai aur Chrome page reload kar sakta hai (form ka data chala jata hai). `dev:phone` mein `@vitejs/plugin-basic-ssl` lagta hai (vite `--mode phone`).

PC ka IP `ipconfig` se dekhein (Wi-Fi adapter ka IPv4). Sirf Vite ka port khula hona chahiye — Vite `/api` ko `localhost:8000` par bhejta hai, is liye port 8000 kholne ki zaroorat nahi.

**Windows Firewall:** pehli dafa Node LAN par sunta hai to Windows poochta hai; **Private** network par allow karein. Agar prompt band kar diya tha to admin PowerShell mein port allow karein (ek tareeqa; apni policy ke mutabiq badlein):
```powershell
New-NetFirewallRule -DisplayName "Vite dev (mobileshop)" -Direction Inbound -Protocol TCP -LocalPort 5173,5174 -Action Allow -Profile Private
```

### 1.7 Playwright browser (ek dafa)
```powershell
cd frontend
npx playwright install chromium
```

---

## 2. Repo ka naqsha

```
CLAUDE.md                 project context + pakke rules (sab se pehle parhein)
README.md                 docs ki fehrist
docs/                     zinda docs 01..14, guides/, archive/ (v1 docs)
backend/                  FastAPI v2
frontend/                 React + Vite + TS + Tailwind PWA, Capacitor Android frontend/android mein
deploy/                   docker-compose, web ka Dockerfile, deploy.sh, backup.sh, setup-vps.sh, ci/
.github/workflows/        ci.yml, deploy.yml, android.yml
.claude/skills/           kickoff, handoff, pk-mobile-domain
legacy/                   v1 prototype — sirf reference, is mein kaam nahi karna (docs/08)
```

### 2.1 Backend (`backend/`)
```
pyproject.toml            dependencies, pytest + ruff config (line length 100, py312)
alembic.ini, alembic/     migrations (file ka naam = <rev>_<slug>.py); env.py SQLite par batch mode use karta hai
app/
  main.py                 create_app(): CORS, error handlers, /health, har module ka include_router(...)
  cli.py                  python -m app.cli create-owner
  core/
    config.py             Settings (pydantic-settings, .env parhta hai)
    errors.py             AppError + NotFound/Unauthorized/Forbidden/Conflict/ValidationFailed
    tenancy.py            CurrentContext (user + active dukaan), Ctx, DB, require_cap(...)
    permissions.py        Role, Cap, role → capabilities
    security.py           JWT, bcrypt
    pk.py                 Pakistani helpers (phone normalise, CNIC, IMEI Luhn…)
    ratelimit.py
  db/
    base.py               Base, UUIDPk, Timestamped, ShopScoped, Money = Numeric(14,2), ZERO
    models.py             har module ke models import karta hai (taake Alembic sab tables dekhe)
    session.py            engine, SessionLocal, get_db
  modules/<name>/         har domain module ka alag folder
    models.py             SQLAlchemy models
    schemas.py            Pydantic in/out models
    service.py            business logic (tenancy checks, Decimal, ledger posting, device events, commit)
    router.py             patle FastAPI routes: auth/capability dependency → service call
  seeds/catalogue.py      brands/models/storages/colours (dobara chalne par bhi theek)
tests/                    pytest; conftest.py = fixtures (client, owner, other_owner, cat, signup, login)
```
Aaj ke modules: accessories, admin, audit, auth, catalogue, devices (+ `state.py` state machine), exchanges, expenses, exports, files, ledger (PostingService), loans, notifications, parties, payments, purchases, repairs, reports, returns, sales, verification.

Usool: **router patla rahe**, saare rules `service.py` mein hon, taake tests aur doosri services unhein dobara use kar sakein.

### 2.2 Frontend (`frontend/`)
```
src/
  main.tsx                providers (react-query, i18n, router)
  app/router.tsx          saare routes;  app/Shell.tsx  header, neeche tabs (phone), side menu + F-keys (laptop)
  components/
    Bilingual.tsx         BiLabel, BiButton, BiInput, BiAlert, BiSegmented, useLang()
    ui.tsx                PageHeader, Sheet, Row, List, MoneyText, BalanceLabel, Chip, SearchBox, Empty,
                          Loading, ErrorText, Section, KV, Stepper, IconChip, BtnText, fmtDate…
    PartyPicker, AccessoryPicker, ScanButton, RemoveSheet, DownloadButton, FieldInputs
  features/<module>/      har module ke pages (counter = home/hisaab/khata, sale, purchase, stock, …)
  lib/
    api.ts                fetch wrapper (auth header, X-Shop-Id, refresh, ApiError)
    queries.ts            TanStack Query hooks; har key active dukaan ki id se shuru hoti hai
    auth.ts, theme.ts     zustand stores
    draft.ts              useDraft (form ka data jo reload ke baad bhi rahe)
    id.ts                 uid() — crypto.randomUUID ke baghair bhi chalta hai (http LAN)
    scan.ts, format.ts, files.ts, types.ts
  i18n/index.ts           i18next setup, setLocale(), both(key)
  i18n/locales/           en.json, ur.json, roman.json  (teeno mein same keys)
  index.css               design tokens (CSS variables) har look/theme ke liye
e2e/                      Playwright specs + fixtures/ (barcode tasveerein, nakli camera stream)
android/                  Capacitor Android project (build.gradle, signing env se)
capacitor.config.ts, vite.config.ts, playwright.config.ts, tailwind.config.js, tsconfig.json (strict)
```

### 2.3 Deploy aur CI
```
deploy/docker-compose.yml   db (postgres 16) + backend + web (Caddy), VPS ke Traefik ke peeche
deploy/web.Dockerfile       React app ko Caddy image mein build karta hai (Caddyfile /api, /health proxy karta hai)
deploy/deploy.sh            VPS par chalta hai: tag pull → up → health check → rakho ya wapis purane par
deploy/backup.sh            raat ko pg_dump + uploads, 14 din
deploy/setup-vps.sh         server ka ek dafa setup
deploy/ci/                  compose.ci.yml + smoke.sh (CI ka "stack" job)
deploy/.env.example         server .env ki keys (values nahi)
```

### 2.4 Jo docs sab se zyada badlenge
| File | Kab |
|---|---|
| `docs/06-PROGRESS.md` | har session ke aakhir mein |
| `docs/09-SESSION-LOG.md` | har session ke aakhir mein (neeche jorna) |
| `docs/10-DECISIONS.md` | jab koi design faisla ho (ADR) |
| `docs/02-FUNCTIONAL-REQUIREMENTS.md` | business rules (FR ids) |
| `docs/04-DATA-MODEL.md` | jab schema badle |
| `docs/11-DESIGN-SYSTEM.md` | UI rules, tokens, components |
| `docs/12-DEPLOYMENT.md`, `docs/13-MOBILE-APP.md` | server aur Android setup |

---

## 3. Session ka tareeqa

### 3.1 Shuru (kickoff)
1. `docs/06-PROGRESS.md` parhein.
2. `docs/09-SESSION-LOG.md` ki **aakhri** entry parhein, us ki **Next** aur **Open** lines samait.
3. `git log --oneline -10` aur `git status --short`.
4. Phir sirf woh code parhein jo is kaam ke liye chahiye. Poora repo dobara audit na karein; `legacy/` tab hi parhein jab wahan se kuch port karna ho.
5. Business rule wala kaam? `docs/02-FUNCTIONAL-REQUIREMENTS.md` ka mutalliqa hissa parhein (Claude Code ke saath `pk-mobile-domain` skill bhi).

Claude Code ke saath: `/kickoff` project skill chalayein (`/resume` nahi, woh built-in command hai).

### 3.2 Kaam ke dauran
- Branch: **`develop`**. `main` sirf release ke liye.
- Chhote, ek kaam wale commits; har commit se pehle tests green.
- Owner na kahe to push nahi karna.

### 3.3 Aakhir (handoff)
1. Jo badla us ke tests chalayein (backend `pytest -q`, frontend `npm test`, mutalliqa Playwright specs). Laal ko kabhi green na batayein.
2. `docs/06-PROGRESS.md` update karein (✅ / 🔄 / ⬜, Known issues).
3. `docs/09-SESSION-LOG.md` mein neeche jorein: tareekh, **Done**, **Verified** (poori commands + nateeje), **Next** (agle session ka pehla theek qadam), **Open questions**.
4. Design faisla hua → `docs/10-DECISIONS.md` mein ADR (`## ADR-0NN · YYYY-MM-DD · Accepted · Title`, phir Context / Decision / Consequences).
5. Schema badla → `docs/04-DATA-MODEL.md` match kare aur migration maujood ho.
6. `develop` par commit.

Claude Code ke saath: `/handoff` skill yeh sab karwata hai.

### 3.4 Git author ka rule (koi chhoot nahi)
- Author **sirf** `Abdur Rehman Afzal <abdurrehmanafzal786@gmail.com>`. Repo ka local git config pehle se set hai; check:
  ```powershell
  git config user.name; git config user.email
  ```
- `Co-Authored-By:` trailer, "Generated with …" line, ya koi bhi AI attribution commit, PR text ya file mein **nahi**. Yeh har tool/harness ke default se upar hai — agar assistant aisi line daale to commit se pehle hata dein.
- Push sirf kehne par. Release = `develop` ko `main` mein merge karke `main` push (section 8), aur kab karna hai yeh owner faisla karta hai.

---

## 4. Pakke rules, misaalon ke saath

### 4.1 Paisa: `Decimal` / `Numeric(14,2)`, float kabhi nahi
DB: `Money` use karein (ya `Mapped[Decimal]` likhein; `Base.type_annotation_map` `Decimal` ko `Numeric(14,2)` bana deta hai):
```python
from decimal import Decimal
from app.db.base import ZERO

amount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
```
Schemas: `amount: Decimal = Field(gt=0)`. API paisa string mein lautati hai (`"25000.00"`) aur tests strings compare karte hain.

Rounding: `app.modules.ledger.service` ka `money()` (0.01 tak, ROUND_HALF_UP). Decimal string se banayein, float se kabhi nahi:
```python
money("1999.995")        # Decimal('2000.00')
Decimal(0.1)             # GHALAT: float ka kachra
```
Frontend: raqam string mein aati hai; `MoneyText` / `BalanceLabel` se dikhayein. Asal total server banata hai; browser mein hisaab sirf live preview ke liye. Currency PKR, Latin digits, jaise `Rs. 125,000`.

### 4.2 Tenancy: har query `shop_id` se bandhi
Har dukaan wali table `ShopScoped` mixin use karti hai. Route active dukaan `ctx: Ctx` se leta hai (JWT + `X-Shop-Id` header, `core/tenancy.py` mein check) aur `ctx.shop_id` service ko deta hai. Service **khud saaf filter** lagati hai:
```python
# list
stmt = select(Expense).where(Expense.shop_id == shop_id)

# id se get: doosri dukaan ki row "not found" hai, "forbidden" nahi (koi andaaza na lag sake)
def get_expense(db, shop_id, expense_id):
    e = db.get(Expense, expense_id)
    if e is None or e.shop_id != shop_id:
        raise NotFound(code="expense_not_found")
    return e

# client se aane wali har doosri id bhi isi dukaan ki honi chahiye
if data.party_id and (p := db.get(Party, data.party_id)) is not None and p.shop_id != shop_id:
    raise NotFound(code="party_not_found")
```
Global rows (seed catalogue, built-in kharche ki categories) ka `shop_id = NULL` hota hai aur yeh `or_(X.shop_id.is_(None), X.shop_id == shop_id)` se parhi jati hain; dukaan sirf apni rows badal sakti hai.

Har naye endpoint ka leakage test `owner` aur `other_owner` fixtures se (dekhein `tests/test_tenancy.py`).

Note: `docs/03-ARCHITECTURE.md` mein `with_loader_criteria` likha hai; asal code oopar wala saaf tareeqa use karta hai — code ko follow karein.

### 4.3 Ledger sirf aage barhta hai (append-only)
Paisa sirf PostingService (`app/modules/ledger/service.py`) se chalta hai:
```python
from app.modules.ledger.service import Posting, post, reverse

posting = (
    Posting(document_type="expense", document_id=e.id, memo="October rent")
    .debit("expense:rent", amount)
    .credit("cash", amount, cash_account_id=cash.id)
)
group = post(db, shop_id, user_id, posting)   # debit aur credit barabar na hon to inkaar
```
- `ledger_entries` ki row kabhi `UPDATE` ya `DELETE` nahi. Balance (party ka baqaya, haath mein cash, statements) entries se **nikala** jata hai.
- Ghalti ka hal = ulti (reversing) group: `reverse(db, shop_id, user_id, group_id, reason)`, phir zaroorat ho to sahi document dobara. Misaal: kharcha cancel karna `reverse(...)` chalata hai aur kharche ka `status`/`void_reason` set karta hai.
- Sign: positive = party ne dukaan ko dene hain ("lena hai"), negative = dukaan ne party ko dene hain ("dena hai").

### 4.4 Device events kabhi nahi badalte
Device ki har tabdeeli (khareed, farokht, amanat jana/aana, wapsi, repair andar/bahar, verification…) `device_events` ki nayi row hai jo `app/modules/devices/service.py` ke `apply_event(...)` se likhi jati hai; device ka `status` us ka nateeja hai jo `devices/state.py` (`next_status`) ki state machine check karti hai. Ghalat tabdeeli par `InvalidTransition`.
```python
apply_event(db, shop_id, user_id, device, EventType.SOLD,
            party_id=customer.id, amount=price, ledger_group_id=group.id,
            document_type="invoice", document_id=inv.id)
```
Event rows kabhi edit/delete nahi; device ki history screen inhi se banti hai. Wohi phone dobara khareeda jaye to `devices` ki wohi row rehti hai (naya cycle, mazeed events), duplicate kabhi nahi.

### 4.5 Errors: code + English + Urdu
`AppError` ki subclasses ek pakke `code` ke saath raise karein; default paigham aam ho to dono zabanon mein khaas paigham dein:
```python
raise ValidationFailed(
    code="party_required",
    message_en="Select who is taking the device",
    message_ur="کون لے کر جا رہا ہے، منتخب کریں",
)
```
Response: `{"error": {"code", "message_en", "message_ur", "details"}}`. UI wohi dikhata hai jo zaban chal rahi hai (Roman mode mein English, ADR-010).

### 4.6 UI: ek waqt mein ek zaban, har lafz i18n se
- Urdu mode = sirf Urdu (Nastaliq, RTL). English mode = sirf English. Roman Urdu mode = sirf Roman (LTR). **EN + UR upar neeche kabhi nahi.**
- Har dikhne wala lafz **teeno** files mein key ho: `en.json`, `ur.json`, `roman.json`. Component mein seedha text nahi.
- Number hamesha Latin digits; number ko `.num` mein lapetein (ya `MoneyText`) taake Nastaliq `0` ko nuqta na bana de.
- Dukaan ke alfaaz, accounting ke nahi (udhaar, lena/dena, "stock daalein", "ID card check").
- Print hone wale documents aur notifications `shops.default_locale` follow karte hain, `?lang=en|ur` se badal sakte hain.

### 4.7 Sirf design-system components — premium look
- Screens sirf design-system components se (`Bilingual.tsx` ke `Bi*`, `ui.tsx` ke primitives, shared pickers) `index.css` ke CSS tokens par (`docs/11-DESIGN-SYSTEM.md`, default look "Modern", ADR-011).
- Emoji icons nahi (`lucide-react`), default neele buttons nahi, khaali safed cards nahi.
- **Har action button jaisa dikhe aur us ka icon ho; icon baghair naam ke bhi nahi** (`BiButton icon=…`, `IconChip`, `BtnText`). Tap hone wale card par "See details ›" (`SeeMore`).
- Tap ki jagah ≥ 44px, main actions 56–64px; roz ke kaam zyada se zyada teen qadam.
- Sirf rang se matlab na samjhayein: raqam ke saath "lene hain / dene hain" bhi likha ho.
- Dark mode check karein: `bg-ink` dark mode mein halka ho jata hai — dark hero cards ke liye `bg-hero`.

Note: `pk-mobile-domain` skill mein abhi bhi English + Urdu label upar neeche likhne ki baat hai; woh line purani hai — `CLAUDE.md` ka ek-zaban rule chalega.

### 4.8 Business logic ke tests
Ledger, balance, device state machine, tax, numbering aur tenancy ke backend tests UI se pehle. Har P0 FR ka kam az kam ek test jis ki docstring mein FR id ho (jaise `"""FR-TXN-09, FR-TXN-10: …"""`).

---

## 5. Naya feature shuru se aakhir tak (misaal)

Misaal: **kharche (expense) mein optional "bill / raseed number"** (`bill_ref`), jo New expense sheet mein likha jaye aur kharche par dikhe. Chhota sa kaam, lekin har layer chhoota hai. (Sirf misaal — yeh field code mein nahi hai.)

### 5.1 Model
`backend/app/modules/expenses/models.py`, `class Expense` ke andar:
```python
bill_ref: Mapped[str | None] = mapped_column(String(40))  # dukaan ka apna bill / raseed number
```
Nayi table? `UUIDPk, ShopScoped, Timestamped, Base` lagayein, paisa `Mapped[Decimal]`, aur naya module ho to `app/db/models.py` mein import karein.

### 5.2 Alembic migration
```powershell
cd backend
$env:PYTHONUTF8 = "1"
.venv\Scripts\alembic upgrade head                                   # pehle DB head par ho
.venv\Scripts\alembic revision --autogenerate -m "expenses bill_ref"
```
Is se `alembic/versions/<rev>_expenses_bill_ref.py` banti hai. **Hamesha parhein** — autogenerate sirf kaccha draft hai:
- Oopar ek line ki docstring: kya aur kyun, jaise purani files mein (`"""purchases.purchased_at: when the phone was actually bought`).
- `env.py` **SQLite par batch mode** banata hai (`render_as_batch=settings.is_sqlite`), kyunke SQLite zyada tar `ALTER` nahi kar sakta. `op.batch_alter_table(...)` blocks rehne dein; PostgreSQL par bhi chalte hain.
- **Har constraint ka naam rakhein.** Autogenerate downgrade mein FK ka naam `None` chhor deta hai (`# WARNING: constraint name is None`) — `upgrade()` wala bilkul wohi naam likhein.
- Purani table mein `NOT NULL` column jorna ho to `server_default` chahiye (SQLite batch copy aur purani rows ki wajah se).
- Autogenerate ka faltu shor (type comparisons jo aap nahi chahte) hata dein.

Is misaal ka nateeja:
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
**Downgrade bhi test karein**, sirf upgrade nahi:
```powershell
.venv\Scripts\alembic downgrade -1
.venv\Scripts\alembic upgrade head
```
Is project ka asal bug: migration `ab0e2601f475` ne FK `fk_accessories_accessory_id` naam se banaya, lekin downgrade `fk_invoice_lines_accessory_id` drop kar raha tha. SQLite ka batch mode table dobara banata hai aur chupchaap pass ho gaya; **sirf PostgreSQL** (CI ka up/down/up job) ne pakra. Hal mein asal (typo wala) naam hi rakha gaya kyunke databases mein woh pehle se tha. Sabaq: constraint ke naam `upgrade()` se `downgrade()` mein copy karein, aur release se pehle PostgreSQL par up/down/up chalayein (6.3).

`tests/test_migrations.py` bhi check karta hai ke `alembic upgrade head` bilkul models wali tables aur columns banaye — migration bhool gaye to yeh fail hoga.

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
`backend/app/modules/expenses/service.py`, `create_expense` mein (tenancy check, Decimal raqam, ledger posting pehle se hain):
```python
e = Expense(
    shop_id=shop_id,
    ...,
    bill_ref=(data.bill_ref or "").strip() or None,
)
```
Agar field ka koi rule ho (jaise har dukaan mein unique) to yahin dono zabanon wale error ke saath lagayein:
```python
raise Conflict(code="bill_ref_exists",
               message_en="This bill number is already saved",
               message_ur="یہ بل نمبر پہلے سے محفوظ ہے")
```
`to_out()` mein naya field shamil ho. Service kamyab likhai ke aakhir mein `db.commit()` karti hai.

### 5.5 Router
Yahan kuch nahi badalna — route pehle hi `ExpenseCreate` service ko deta hai. **Naye endpoint** ke liye:
```python
@router.get("/by-bill/{bill_ref}", response_model=ExpenseOut)
def by_bill(bill_ref: str, ctx: Exp, db: DB):          # Exp = Ctx + require_cap(Cap.EXPENSES)
    return service.to_out(db, service.get_by_bill(db, ctx.shop_id, bill_ref))
```
- Sahi dependency chunein: `Ctx` (dukaan ka koi bhi logged-in member) ya `Annotated[Ctx, Depends(require_cap(Cap.X))]`.
- Fixed paths (`/by-bill/...`, `/day-close`) `/{id}` wale routes se **pehle** likhein.
- Naye module ka router `app/main.py` mein (`app.include_router(...)`) jorna hai.
- Routes jorne ke baad **uvicorn restart** karein (section 7.1).

### 5.6 Backend tests
`backend/tests/test_expenses.py` mein:
```python
def test_expense_keeps_bill_ref(db, owner, other_owner):
    seed_categories(db)
    rent = next(c for c in owner.get("/api/v1/expenses/categories").json() if c["key"] == "rent")
    r = owner.post("/api/v1/expenses",
                   json={"category_id": rent["id"], "amount": "1500", "bill_ref": " B-17 "})
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["bill_ref"] == "B-17" and e["amount"] == "1500.00"
    # doosri dukaan isay nahi dekh sakti
    assert other_owner.get(f"/api/v1/expenses/{e['id']}").status_code == 404
```
Chalayein: `.venv\Scripts\pytest -q tests/test_expenses.py`, phir poora suite aur `ruff check app tests`.

### 5.7 Frontend data
Saada screens `src/lib/queries.ts` ke generic hooks use karti hain:
```ts
const { data } = useGet<Expense[]>(['expenses'], '/api/v1/expenses')          // key ke aage dukaan ki id lagti hai
const create = useDocMutation<Record<string, unknown>, Expense>('POST', () => '/api/v1/expenses')
```
`useDocMutation` kamyabi par dukaan ki saari queries refresh karta hai (document kai lists ko chhoote hain). Jo data kai screens par chahiye us ka naam wala hook `queries.ts` mein aur type `lib/types.ts` mein banayein. `Expense` interface mein `bill_ref: string | null` jorein.

### 5.8 Design-system components se UI
`features/expenses/ExpensesPage.tsx` (New expense sheet) mein:
```tsx
<BiInput label="expense.billRef" value={billRef} onChange={(e) => setBillRef(e.target.value)} />
...
create.mutate({ category_id: catId, amount, description: desc, bill_ref: billRef || null })
```
aur detail par: `<KV k="expense.billRef" v={current.bill_ref ?? '—'} />`.
Labels mein **i18n key** (ya `{en, ur, roman}` object) do; seedha English lafz kabhi nahi. Errors: `<ErrorText error={create.error} />`.

Agar box backspace se khaali kiya jaye to "chhuwa nahi" aur "khaali kiya" alag rakhein (`null` bamuqabla `''`). Purana bug: `value={refund === '' ? paidFor : refund}` har dafa khaali karne par box dobara bhar deta tha.

Lambe, kai qadam wale forms jin mein camera khul sakta hai `useState` ki jagah `useDraft(key, initial)` use karein taake Android reload par entry na jaye; save ke baad `clearDrafts(prefix)`.

### 5.9 Teeno locales mein i18n keys
Har file mein same namespace ke andar same key:
```jsonc
// en.json      "expense": { …, "billRef": "Bill number" }
// ur.json      "expense": { …, "billRef": "بل نمبر" }
// roman.json   "expense": { …, "billRef": "Bill number" }
```
- Jo key pehle se object namespace hai use dobara string na banayein (ek dafa `stock.condition` ko string bana diya to `stock.condition.*` ke saare labels mit gaye). Naya naam lein (`stock.conditionShort`).
- Urdu saada dukaan wali zaban mein; Roman waisa jaise dukandar WhatsApp par likhte hain.

### 5.10 Playwright spec
`e2e/crud.spec.ts` barhayein ya `e2e/<feature>.spec.ts` banayein. Suite ka tareeqa: English zabardasti, random `039…` number se aarzi dukaan signup, label/role se chalana:
```ts
test('expense: bill number is kept', async ({ page }) => {
  await signup(page)                                   // helper jaisa crud.spec.ts mein
  await page.goto('/expenses')
  await page.getByRole('button', { name: 'New expense' }).click()
  await page.getByRole('button', { name: 'Tea & refreshments' }).click()
  await page.getByLabel('Amount').fill('500')
  await page.getByLabel('Bill number').fill('B-17')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('B-17')).toBeVisible()
})
```
Screen Urdu mein bhi dikhti hai to `e2e/urdu.spec.ts` chalayein; Urdu mode mein English lafz aa jayein to yeh fail hota hai.

### 5.11 Docs
- `docs/04-DATA-MODEL.md` (naya column), rule badla ho to `docs/02`.
- Handoff par `docs/06-PROGRESS.md`, `docs/09-SESSION-LOG.md`; faisla hua ho to ADR.

### 5.12 Checklist
- [ ] model + parhi hui migration (up aur down dono test)
- [ ] schema in/out
- [ ] service: Decimal, `shop_id` checks, dono zabanon ke errors, ledger/events services ke zariye
- [ ] router (+ naye module ke liye `main.py`), uvicorn restart
- [ ] pytest tenancy samait; ruff saaf
- [ ] hook/type, design-system components se UI, icon + naam
- [ ] en/ur/roman mein keys
- [ ] Playwright spec; Urdu screenshot dekha
- [ ] docs update

---

## 6. Testing

### 6.1 Backend
```powershell
cd backend
$env:PYTHONUTF8 = "1"
.venv\Scripts\ruff check app tests                 # lint (CI bilkul yehi chalata hai)
.venv\Scripts\ruff check app tests --fix           # khud theek (imports ki tarteeb waghera)
.venv\Scripts\pytest -q                            # saare tests, in-memory SQLite, har test ka naya schema
.venv\Scripts\pytest -q tests/test_ledger.py       # ek file
.venv\Scripts\pytest -q -k "void"                  # naam se
.venv\Scripts\pytest -q -x --lf                    # pehli failure par ruko, pichli failures dobara
```
Fixtures (`tests/conftest.py`): `client`, `db`, `owner` (signup shuda dukaan, `Actor` jis ke `.get/.post/.patch/.put/.delete` auth + `X-Shop-Id` bhejte hain), `other_owner` (leakage tests ke liye doosri dukaan), `cat` (seed catalogue + Nokia 105 refs), helpers `signup()` aur `login()`.

Tests ke IMEI Luhn check pass karein, jaise `490154203237518`, `356938035643809`, `356789104552375`.

**Wohi tests PostgreSQL par** (`TEST_DATABASE_URL`; CI ka stack PG 16 hai). `pip install -e ".[dev,postgres]"` aur ek aarzi database chahiye (saari tables drop karke dobara banti hain):
```powershell
# Docker wali misaal (is PC par verify nahi ki); aarzi password
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

### 6.3 PostgreSQL par migrations (jo CI karta hai)
```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://ms:ms@localhost:5432/ms_test"
.venv\Scripts\alembic upgrade head
.venv\Scripts\alembic downgrade base
.venv\Scripts\alembic upgrade head
Remove-Item Env:DATABASE_URL
```

### 6.4 Playwright (E2E)
Chahiye:
- backend **:8000** par, `PUBLIC_SIGNUP=true` ke saath (specs aarzi dukanein signup karti hain) aur `SUPERUSER_PHONES` mein `03990000099` (`admin.spec.ts` ke liye);
- frontend **:5173** par — Playwright khud `npm run dev` chala leta hai ya chalta hua use kar leta hai.

```powershell
cd frontend
npm run e2e                                  # saari specs
npx playwright test e2e/crud.spec.ts         # ek file
npx playwright test -g "bill number"         # test ke naam se
npx playwright test --headed                 # chalta hua dekhein
npx playwright show-report                   # failure ke baad (trace + screenshot failure par rakhe jate hain)
```
- Ek project, **Pixel 7** device (phone ka size). Laptop wale checks spec ke andar viewport badalte hain (`counter.spec.ts` mein `test.use({ viewport: { width: 1366, height: 820 }, isMobile: false, hasTouch: false })`).
- `scan-live.spec.ts` Chrome ko nakli camera deta hai (`e2e/fixtures/label-live.mjpeg`).
- `add-device.spec.ts` `crypto.randomUUID` hata deta hai taake http LAN wale phone jaisa chale.
- **Maloom flake:** `admin.spec.ts` ("super admin opens a shop") poore run mein load ke waqt kabhi timeout hota hai; akela chalayein to pass. Tafteesh se pehle akela chala kar dekhein.
- PC par ek waqt mein do bhari Playwright suites na chalayein.

### 6.5 CI kya chalata hai (`.github/workflows/ci.yml`)
`develop` par har push, har PR, aur har release se pehle:
| Job | Qadam |
|---|---|
| backend | `pip install -e ".[dev,postgres]"`, `ruff check app tests`, `pytest -q -p no:warnings` (SQLite), phir PostgreSQL 16 par `alembic upgrade head / downgrade base / upgrade head` |
| frontend | `npm ci`, `npm run typecheck`, `npm test`, `npm run build` |
| stack | production images build, db + backend + web ikatthe, `deploy/ci/smoke.sh` (health, app page, deep link, signup, seed catalogue, banda, phone, report) |

Playwright CI mein **nahi** — UI badalne ke baad local chalayein.

---

## 7. Debugging aur maloom masle

### 7.1 Naya route browser mein 404 (uvicorn reloader)
Is PC par reloader baar baar naye routes miss karta raha, aur ek dafa ek yateem worker purane code ke saath port 8000 pakre baitha raha.
```powershell
netstat -ano | findstr :8000                     # ek se zyada LISTENING PID = purana process
taskkill /PID <pid> /F
# bache hue uvicorn / multiprocessing-spawn python processes dhoondein
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object CommandLine -match 'uvicorn|multiprocessing' | Select-Object ProcessId, CommandLine
Stop-Process -Id <pid> -Force
```
Phir `--reload-dir app` ke saath dobara chalayein. Rule: **endpoints jorne ke baad backend restart.**

### 7.2 Naye Tailwind classes ya tokens asar nahi karte
`tailwind.config.js` badalne ke baad Vite restart karein (aur bare changes ke baad classes purani lagein tab bhi). 5173 pakre purane `node`/vite processes isi tarah band karein (`netstat -ano | findstr :5173`).

### 7.3 Urdu ka dikhna
- Nastaliq `0` ko nuqta bana deta hai → digits `.num` (Manrope) ya `MoneyText` mein.
- Nastaliq ko jagah chahiye: Urdu labels `leading-[1.7]`; `leading-tight` Urdu ko kaat deta hai.
- `.ur` aur `html[lang=ur] body` `Manrope, 'Noto Nastaliq Urdu'` use karte hain taake Urdu ke andar Latin huroof/digits Manrope mein rahein.
- RTL: `setLocale('ur')` `<html>` par `dir="rtl"` lagata hai. left/right ki jagah logical classes (`text-start`, `ps-*`, `me-*`, `start-*`) taake layout sahi palte.
- UI kaam ke baad `e2e/urdu.spec.ts` chalayein aur us ke screenshots dekhein.

### 7.4 Sirf phone wale bugs (http LAN)
`http://<PC-IP>:5173` secure context nahi: `crypto.randomUUID`, clipboard aur page ke andar camera (`getUserMedia`) nahi milte. `lib/id.ts` ka `uid()` use karein aur fallback rakhein. Localhost aur Playwright secure context hain, is liye yeh masla wahan chhup jata hai.

### 7.5 Android: camera khulne par page reload → `useDraft`
http link par Android camera app kholta hai aur Chrome page reload kar sakta hai. Aise forms `useDraft` (sessionStorage, 30 minute) use karte hain. Draft sirf usi page par wapis aata hai jo browser ne khud reload kiya, aur sirf jab tak user doosri screen par na jaye (Shell mein `noteRoute`) — app se form kholein to hamesha naya shuru hota hai.

### 7.6 Python/Pydantic
- Jis module mein `date` type bhi ho wahan field ka naam `date` masla karta hai → `import datetime as dt`.
- `UnicodeEncodeError` / `charmap` codec errors → `PYTHONUTF8=1` set nahi.

### 7.7 Migrations
SQLite batch mode FK ke naam ki ghalti chhupa deta hai; PostgreSQL nahi (5.2). `NOT NULL` add_column ko `server_default` chahiye.

### 7.8 Android build: Groovy call precedence (`frontend/android/app/build.gradle`)
Groovy mein baghair bracket wali method call aap ki soch se zyada kas kar judti hai:
```groovy
versionCode (System.getenv("APP_VERSION_CODE") ?: "1").toInteger()
// aise parha gaya: versionCode(...).toInteger()  -> versionCode ko String mili
keyPassword System.getenv("ANDROID_KEY_PASSWORD") ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
// aise parha gaya: keyPassword(getenv(...)) ?: ...  -> fallback kabhi pohncha hi nahi
```
Hal (ab repo mein): value pehle nikal lein (`def appVersionCode = Integer.parseInt(...)`) ya poore argument ko bracket mein band karein: `keyPassword(a ?: b)`.

### 7.9 Naye domain par pehla deploy: `curl` exit 60
Traefik pehli request par Let's Encrypt certificate leta hai; ek minute tak curl ko ghalat certificate milta hai (exit code 60). Deploy workflow ka aakhri check 2 minute tak dobara koshish karta hai. App par shak se pehle intezar karke dobara check karein.

### 7.10 Android app mein print / download
Receipts aur PDF/Excel/CSV downloads browser ka print dialog aur downloads use karte hain jo WebView mein nahi; APK mein abhi yeh kuch nahi karte (docs/13 "Known gaps"). Inhein website par test karein.

---

## 8. Release aur deploy

Server aur Android ka ek dafa wala setup: `docs/12-DEPLOYMENT.md` aur `docs/13-MOBILE-APP.md`. Yeh section roz ka kaam hai.

### 8.1 Flow
```
develop  --push-->  CI (ci.yml)
main     --push-->  Deploy (deploy.yml): CI → images ghcr.io par (tag = commit sha + latest)
                    → ssh deploy@<vps> "sudo -n /opt/mobileshop/deploy.sh <sha>"
                      (pull → up -d → /health ka intezar → rakho, ya pichle tag par wapis)
                    → APP_URL/health check (2 minute tak dobara koshish)
         --push-->  Android (android.yml) jab frontend/ badla ho: signed APK run artifact mein
```
Release (sirf jab owner kahe):
```powershell
git checkout main
git pull
git merge develop
git push origin main
git checkout develop
```
Dono workflows haath se bhi chal sakte hain: GitHub → Actions → Deploy / Android → Run workflow.

Migrations backend container start hote hi khud chalti hain (`backend/Dockerfile` mein `alembic upgrade head`).

### 8.2 Android APK
- `android.yml`: `npm run build:native` (`vite build --mode native`, service worker nahi, `VITE_API_URL` = repo variable `APP_URL`, phir `cap sync android`) → `gradlew assembleRelease`.
- Signing secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`. In ke baghair **debug-signed test APK** banta hai, jise baad wala release-signed APK update nahi kar sakta.
- APK run page se download karein (artifact `mobile-shop-android-1.<run>`, 90 din). Version code = run number.
- Release keystore hamesha har update sign karega; us ka backup server se bahar rakhein.

### 8.3 Server par pehla login
Production mein signup band hai. VPS par:
```bash
cd /opt/mobileshop && docker compose exec backend python -m app.cli create-owner
```
More → Super admin ke liye woh number use karein jo `/opt/mobileshop/.env` ke `SUPERUSER_PHONES` mein hai.

### 8.4 VPS par
```bash
cd /opt/mobileshop
docker compose ps                          # haal
docker compose logs --tail 100 backend     # logs (-f se live)
docker compose logs --tail 100 web
cat .current-tag                           # kaunsa commit chal raha hai
sudo /opt/mobileshop/deploy.sh <older-sha> # haath se purane image tag par wapsi
```
Wapsi (rollback) migrations **ulti nahi** karti. Schema change ke paar wapsi ke liye database restore chahiye.

### 8.5 Backup aur restore
Har raat 02:30 (`deploy/backup.sh`): `pg_dump` + uploads ka tarball `/opt/mobileshop-backups` mein, 14 din. Inhein baqaidagi se server se bahar copy karein. Restore:
```bash
cd /opt/mobileshop
docker compose exec -T db pg_restore -U mobileshop -d mobileshop --clean < /opt/mobileshop-backups/db-YYYYMMDD-HHMM.dump
```
Owner ki ijazat ke baghair production server ko haath na lagayein.

### 8.6 Production stack local chalana (optional)
CI ka `stack` job haath se (Docker chahiye; Linux/Git Bash ke liye likha hai, is Windows PC par verify nahi):
```bash
docker network create n8n_default          # Traefik ka network, VPS par maujood hai
cd deploy
APP_DOMAIN=ci.localhost POSTGRES_PASSWORD=local-only SECRET_KEY=local-only-0123456789abcdef0123456789abcdef \
PUBLIC_SIGNUP=true IMAGE_PREFIX=mobileshop-ci IMAGE_TAG=local \
docker compose -f docker-compose.yml -f ci/compose.ci.yml up -d --build --wait db backend web
cd .. && bash deploy/ci/smoke.sh
```

---

## 9. Conventions

### 9.1 Code style
- **Python:** ruff, line length 100, target py312 (`pyproject.toml`). Har jagah type hints; SQLAlchemy 2 typed `Mapped[...]`; field ka naam `date` ho to `import datetime as dt`. Router patle, logic services mein.
- **TypeScript:** `strict`, `noUnusedLocals`, `noUnusedParameters`; `src/` ke liye `@/` alias. Function components + hooks; server ka data TanStack Query mein, client ka state zustand mein.
- **Naam:** Python `snake_case`, modules jama (`expenses`); error codes `snake_case` (`category_not_found`); API `/api/v1/<module>` ke neeche; React components `PascalCase.tsx`, hooks `useX`; i18n keys `module.camelCase` (`expense.billRef`); test files `test_<module>.py`, `<feature>.spec.ts`.
- **Comments:** kam. Module docstrings mein FR ids. *Kyun* likhein — khaas taur par owner ke faisle tareekh ke saath (`# owner, 2026-10-26: ...`) aur ajeeb bugs — *kya* nahi.

### 9.2 Commit messages
Conventional commits, chhoti English, jo nateeja dikhe woh likhein (dekhein `git log --oneline -40`):
```
feat(frontend): expenses page - big 'New expense' and 'Close the day' buttons in the page
fix: migration downgrade used the wrong FK name (fails on PostgreSQL); smoke test checks every step
fix(android): gradle read the version and key password wrongly (Groovy call precedence)
ci: GitHub Actions CI and deploy to the OOP Solutions VPS behind Traefik (images on ghcr.io)
docs: session log - expenses page
style: import block in conftest
```
Types: `feat`, `fix`, `docs`, `ci`, `style` (scope optional: `frontend`, `backend`, `android`, koi module). Sirf docs wale handoff commits aam taur par alag (`docs: session log - …`). AI attribution lines nahi (3.4).

### 9.3 Branch flow
- `develop`: saara kaam; har push par CI.
- `main`: sirf release (`develop` se merge; har push deploy karta hai).
- Owner ke kahe baghair push nahi.

---

## 10. Masle aur hal (FAQ)

**`UnicodeEncodeError: 'charmap' codec can't encode…`** — is terminal mein `PYTHONUTF8=1` set nahi.

**`py -3.12` nahi mila / venv mein ghalat Python** — Python 3.12 install karein; `backend/.venv` delete karke `py -3.12 -m venv .venv` se dobara banayein.

**Local mein signup "closed" kehta hai (`signup_closed`, 403)** — `backend/.env` mein `PUBLIC_SIGNUP=true` karke backend restart.

**More mein "Super admin" nahi** — aap ka login number `SUPERUSER_PHONES` mein nahi; jorein aur backend restart.

**`admin.spec.ts` fail** — `SUPERUSER_PHONES` mein `03990000099` hai? Hai, aur sirf poore run mein fail hota hai, to woh maloom flake hai; akela chalayein.

**Abhi likha route API par 404** — reloader ka masla; purane process band karke restart (7.1). Yeh bhi dekhein ke router `main.py` mein hai aur fixed paths `/{id}` se pehle hain.

**`no such column` / `table … has no column`** — `alembic upgrade head` chalayein. Migration hi nahi hai → `tests/test_migrations.py` bhi fail hoga.

**`alembic revision --autogenerate` khaali ya bohat bari migration banata hai** — generate se pehle DB head par nahi tha, ya naye module ke models `app/db/models.py` mein import nahi.

**Downgrade PostgreSQL par fail, SQLite par theek** — upgrade aur downgrade mein constraint ka naam mukhtalif (5.2).

**`X-Shop-Id` / `shop_required` / `shop_forbidden` errors** — user kai dukanon ka hai aur header nahi bheja, ya shop id us ki dukaan nahi.

**Frontend par `expense.billRef` jaisi kacchi keys dikhti hain** — us locale file mein key nahi, ya namespace object ko string se overwrite kar diya.

**Urdu mode mein English alfaaz** — seedha likha hua text ya `ur.json` mein key ghayab; `e2e/urdu.spec.ts` inhein pakarta hai.

**Phone `http://<PC-IP>:5173` nahi kholta** — wohi Wi-Fi? `npm run dev:lan` (na ke `dev`)? Private profile par Node / port 5173 ka firewall rule?

**Camera alag app kholta hai aur form khaali ho jata hai** — live scan ke liye `npm run dev:phone` (https :5174); forms `useDraft` use karein.

**Button PC par chalta hai, phone par kuch nahi** — http LAN par secure-context API (`crypto.randomUUID`, clipboard); `uid()` / fallback use karein.

**Tailwind class ka asar nahi** — Vite restart (7.2); check karein token `index.css` mein mojooda look ke liye hai.

**Dark mode mein text nahi parha jata** — dark background ke liye palatne wala token (`bg-ink`) use hua; `bg-hero` lagayein aur har look check karein.

**Deploy workflow: images theek, aakhri check curl exit 60 par fail** — naye domain par certificate abhi nahi aaya; intezar karke `/health` dobara check karein.

**Deploy khud wapis (rollback) ho gaya** — naya version `/health` par fail hua; `deploy.sh` ne backend log print kiya. VPS par `docker compose logs --tail 200 backend` parhein (aksar migration ka error).

**APK purane ke oopar install nahi hota** — mukhtalif key se sign (debug bamuqabla release) ya version code kam; purana uninstall karein ya release key use karein.

**APK mein Print/Download kuch nahi karta** — maloom kami (7.10); website use karein.
