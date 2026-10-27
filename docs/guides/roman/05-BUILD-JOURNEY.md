# 05 — Build Journey: zero se live deployment tak

Mobile Shop (https://mobileshop.oopsolutions.com) kaise bana, qadam ba qadam, aur isay dobara zero se kaise banayein.
Owner aur product ke faislay karne wale: **Abdur Rehman Afzal** (OOP Solutions).

Is guide ki har baat repo se li gayi hai: git history (`develop` par 117 commits), session log (`docs/09-SESSION-LOG.md`), decisions (`docs/10-DECISIONS.md`, ADR-001 se ADR-013) aur baqi living docs. Jahan log mein koi baat nahi likhi, wahan saaf bata diya gaya hai. Dates aur test counts bilkul wohi hain jo log mein darj hain.

- **Part A** — Safar, phase ba phase
- **Part B** — Zero se dobara banana (playbook)
- **Part C** — Sabaq aur aage kya hai
- **Appendix** — Test counts ka record

---

## Timeline ek nazar mein

| Date | Milestone | Commit |
|---|---|---|
| 2026-06-25 | v1 prototype ka pehla commit (FastAPI + SQLite, React + Vite, 82 files) | `c0e5810` |
| 2026-07-14 | v1 UI/UX improvements | `4e51155` |
| 2026-07-19 | v1 mein CNIC aur IMEI validation | `fc9bf99` |
| 2026-10-22 | v1 ki aakhri tabdeeli ("changes") | `92e953b` |
| 2026-10-22 | v2 ke liye repo restructure: `legacy/`, docs 01–10, ADRs, CLAUDE.md, project skills | `bf257e7` |
| 2026-10-22 | v2 backend foundation: tenancy, auth, roles, shops, staff, audit log | `266d237` |
| 2026-10-22 | v2 frontend foundation: Vite/React/TS PWA shell, bilingual UI | `3e30959` |
| 2026-10-22 | Design system "Emerald & Gold" implement | `6bd582c` |
| 2026-10-22 | Catalogue → parties → ledger → devices → verification → purchases → sales → payments/loans → returns | `57487f6` … `03dae38` |
| 2026-10-22 | UI mein ek waqt mein ek zubaan | `d55a246` |
| 2026-10-22 | Phase 1 screens (parties, stock, purchase wizard, verification, sale wizard…) | `27bebef`, `681b39b`, `c6c7144` |
| 2026-10-22 | Phase 2 backend: expenses/day close, repairs, accessories, exchange, reports | `16fec8d` … `5082737` |
| 2026-10-22 | Phase 2 screens, staff aur cash accounts | `1e2ad2f`, `466e2c0` |
| 2026-10-22 | Pehla deploy setup (Docker Compose + Caddy) | `2218ef5` |
| 2026-10-22 | Easypaisa jaisa home, PIN login, opening stock | `1d6f6c4` |
| 2026-10-22 | Owner ka pehla phone test Wi-Fi par ("UI ok hai") | `e149ca5` |
| 2026-10-22 | Exports, PWA, Capacitor scaffold, Playwright E2E | `f28244e`, `ea567f1`, `4ad20e0`, `4ecdec4` |
| 2026-10-26 | Har cheez edit aur delete | `d348102`, `6720e2e` |
| 2026-10-26 | Design v2 "Dukaan counter" + 3 step sale | `fa4ed6a`, `4108adc`, `7f962bb` |
| 2026-10-26 | Wapsi mein shop ki cut; stock daalna 3 steps mein | `435f5ff`, `b333fa1` |
| 2026-10-26 | Owner reports, naam, ID check skip; repair 3 steps mein | `37a025f`, `84a9f8a` |
| 2026-10-26 | PDF / Excel / CSV downloads; "haath mein kitna" ki wazahat | `057ca1c`, `5843a27`, `14ace2d` |
| 2026-10-26 | Roman Urdu, Urdu fixes, period ka hisaab | `5e09b5b`, `c5b684d`, `385ceb8` |
| 2026-10-26 | Looks, phir "Modern" (Stripe × Google) default | `46c4c8e`, `8cb7e41` |
| 2026-10-26 | Super admin; public signup band | `2a5f389` |
| 2026-10-27 | Settings cards; poora phone catalogue + field checks | `83221b2`, `db73321` |
| 2026-10-27 | Accessories: Nahi / Mil gaya / Baad mein | `905587f` |
| 2026-10-27 | IMEI barcode scan; reload par form mehfooz | `38e067b`, `1a322c6`, `f6ab32c`, `baf1596` |
| 2026-10-27 | VPS par Traefik ke peeche CI/CD | `5df4a78` |
| 2026-10-27 | CI ne PostgreSQL migration bug pakra aur fix hua | `2c2b538` |
| 2026-10-27 | **Live** (pehla deploy merge `6cec924` se) | — |
| 2026-10-27 | `create-owner` CLI; release `00e67d0`; owner ka pehla login | `2847efa`, `aa9fb82` |
| 2026-10-27 | Android APK GitHub Actions mein build aur sign; APK 1.2 owner ke phone par | `4aa2437`, `98ecb0a`, `0b8b5ab` |

Note: git dates ke mutabiq v2 ka kaam teen hisson mein hua: 2026-10-22 (sessions 1–24), 2026-10-26 (session 25) aur 2026-10-27 (sessions 26–27 aur live hona).

---

# Part A — Safar

## A1. v1 prototype aur woh kyun badla gaya (2026-06-25 → 2026-10-22)

**Kya tha.** v1 (ab `legacy/` mein) FastAPI + SQLAlchemy + SQLite backend tha, 57 endpoints ke saath, aur React 18 + Vite + Tailwind + i18next frontend, 10 pages ke saath. Ek hi shop, koi login nahi; 4 commits mein taqreeban 12.7k lines.

Is ne domain ko sabit kiya: PTA status aur SIM time, IMEI 1/2/3, trade-in purchase par CNIC aur photos, har device ki accessories, phone history screen, aur bilingual UI pattern (`BilingualLabel`, `BilingualButton`…).

**Usi ko aage kyun nahi barhaya** (`docs/08-LEGACY-AUDIT.md`, audit 2026-10-22):
- tenancy, users ya auth nahi — har endpoint public aur ek shop ka;
- paisa `Float` mein, balances badalne wale columns mein;
- ek hi cheez ke do models (`Customer`/`Supplier` aur `Party`), duplicate module files;
- Alembic nahi, tests bilkul nahi;
- 1,543 line ki route file, jis mein ~850 lines demo-data generators POST endpoints ki shakal mein;
- 2,000 line ki screens, do API clients (ek bekaar);
- device history tables jod kar banti thi, event log se nahi; loan, repair, return flows mojood hi nahi;
- kamzor setup (pinned versions, `PYTHONUTF8=1` ke baghair Windows cp1252 crash).

Owner ne yeh bhi bataya ke ~50 dukandaron ne v1 UI ko **"not modern, not luxury"** kaha. Is se FR-PLT-08 bana: premium, modern design jo screens banne se pehle approve ho.

**Faisla.** ADR-001: v2 naye sire se banao, v1 sirf reference ke liye `legacy/` mein rakho, aur us ke seeds, Urdu strings, bilingual components ke ideas aur domain rules dobara istemal karo.

## A2. v2 ki buniyad (2026-10-22, sessions 1–4)

**Repo restructure** (`bf257e7`):
- v1 code `legacy/` mein, v1 docs `docs/archive/` mein;
- naye living docs `docs/01–10`;
- `CLAUDE.md` mein hard rules;
- teen project skills: `kickoff`, `handoff`, `pk-mobile-domain`. Pehle skill ka naam `resume` tha, `kickoff` kiya gaya kyun ke `/resume` Claude Code ki built-in command hai.

Repo ka git author Abdur Rehman Afzal set hua (ADR-006) aur branch `develop` bani.

Code se pehle likhe gaye docs: business requirements (scenarios S1–S6, "Nokia chain" samet: walk-in se khareed + verification → saath wali shop ko loan → wapas aya → dobara bika), FR ids ke saath functional requirements, architecture, data model, roadmap, progress tracker, testing strategy.

**Us din ke ahem ADRs**
- ADR-002: append-only ledger aur append-only device events; balance aur device status hamesha derive hote hain.
- ADR-003: cloud par PostgreSQL, local par SQLite, code ek hi SQLAlchemy.
- ADR-004: ek React PWA, baad mein Capacitor se app.
- ADR-005: Twilio ke bajaye WhatsApp Cloud API; approval tak `wa.me` share links.

**Backend foundation** (`266d237`): FastAPI app factory, bilingual error envelope, SQLAlchemy 2 base (UUID keys, timestamps, `ShopScoped`, `Numeric` money), organisations / shops / users / user_shops / audit_log, Alembic initial migration, JWT access + refresh, bcrypt, Pakistani phone normalisation, `X-Shop-Id` tenancy context, role → capability matrix.
Verify: **17 backend tests** (auth, tenancy isolation, roles, audit, migration/model parity), ruff clean, live smoke (`/health`, signup, `/me`, duplicate phone → bilingual 409).

**Frontend foundation** (`3e30959`): Vite + React 18 + TypeScript + Tailwind, i18n (Urdu default, RTL), bilingual primitives, auto-refresh wala API client, zustand auth store, login/signup, bottom nav wala mobile shell. Verify: **7 vitest**, `tsc` clean, build ok.

**Design system v1 "Emerald & Gold"** (sessions 2–3): owner ke liye 5 phone screens ka interactive mockup publish hua. Owner ne Direction A "both light and dark" ke saath approve kiya (ADR-007): CSS variables mein tokens, light/dark/system theme, emoji ki jagah Lucide icons, Manrope font (`6bd582c`). 9 vitest.

**Catalogue** (session 4, `57487f6`): global + har shop ke apne brands, models, storages, colours. Idempotent seed legacy se port karke barhaya gaya: 17 brands, 108 models, 7 storages, 16 colours. **24 tests.** Is se Phase 0 mukammal hua.

## A3. Used-mobile ka core (2026-10-22, sessions 5–12)

Roadmap wali tarteeb se bana: parties → ledger → devices + events → verification → purchase → sale → payments → loans → returns. Har module ke tests screen se pehle likhe gaye.

| Session | Module | Kya karta hai | Baad mein tests |
|---|---|---|---|
| 5 | Parties + `core/pk.py` | Customer/supplier/shop/technician ek table mein; phone har shop mein unique; phone (+92/0/Urdu digits), CNIC, IMEI (Luhn) validators; balance sirf parhne ke liye | 32 |
| 6 | Ledger | Cash accounts (default "Cash"), balanced `ledger_groups` aur append-only `ledger_entries`; `Posting` builder, `post()` Σdebit = Σcredit check karta hai, `reverse()` sirf ek dafa; statements, cash book, opening balances; random sale/payment par hypothesis property test | 43 |
| 7 | Devices + events | State machine table; `apply_event()` hi status likhta hai; bika hua phone wapas khareedne par `cycle_no`; IMEI passport/lookup; accessories bundle; salesman se cost chhupi | 52 |
| 8 | Verification + files | Har device cycle ka ek record: CNIC + photos, seller photo, eGadget result, PTA check, declaration print; `flagged` sale rokta hai, `pending` par override chahiye; uploads shop ke hisaab se alag | 57 |
| 9 | Purchases | `PUR-000001` numbering, discount device cost mein baant, ledger Dr inventory / Cr party, abhi diya paisa; void tab tak jab tak phone hila na ho | 63 |
| 10 | Sales | `INV-` numbering, sellability check aur inline owner override, tax inclusive/exclusive, device cost par COGS, accessories diye/baqi, void, thermal/A4 receipt | 72 |
| 11 | Payments + loans | FIFO ya khud allocation, advance negative balance; amanat (loan) doosri shop ko, wapsi, ya sale bana dena | 79 |
| 12 | Returns | Sale return: paise wapas / khate mein credit / income rakh lo; supplier ko purchase return | 84 |

Masle aur un ka hal (log mein "gotchas"):
- IMEI test fixtures Luhn-valid hone chahiye.
- SQLite batch migrations ko named foreign keys chahiye; `add_column NOT NULL` ko `server_default` chahiye.
- Pydantic field ka naam `date` aur `date` type takrate hain — `import datetime as dt` use karein.
- `test_migrations` mein engine `finally` mein dispose karein (Windows file lock).

Verify hua: Nokia chain (S1–S3) API se poori chali — walk-in khareed + verification → Shop B ko loan → sale ban gayi (1,000, 500 mile) → wapas aya to void → doosre customer ko 1,500 mein → history mein chhe ke chhe events; cash aakhir mein +500.

## A4. Ek waqt mein ek zubaan, print aur notifications (sessions 13–14)

Pehli screens dekh kar owner: **"Urdu mein poora Urdu, English mein sirf English, mix nahi."** English + Urdu ke ooper neeche labels hata diye gaye; `Bilingual.tsx` ab sirf chuni hui zubaan dikhata hai (`d55a246`). Yeh rule CLAUDE.md aur FR-PLT-01 mein gaya.

Phir owner ne kaha ke receipt aur declaration shop ki zubaan mein hon, aur stock aane aur sale par owner aur customer ko WhatsApp/email (optional) jaye. Bana (`5d548c4`):
- ek zubaan mein receipt aur declaration (`shops.default_locale`, `?lang=` se badal sakte hain; Urdu RTL Nastaliq, digits Latin);
- notification outbox, EN/UR templates aur `wa.me` links ke saath;
- sale/purchase/payment ke andar hooks.

Asal senders (Meta API, SMTP) baad ke liye chhore gaye. **89 tests.**

## A5. Phase 1 screens (session 15)

Teen commits (`27bebef`, `681b39b`, `c6c7144`):
- shared UI kit aur typed query hooks;
- parties, statement aur paise lo/do ke saath;
- stock, IMEI lookup, device detail aur history timeline;
- 4 step purchase wizard;
- verification page (camera wale photo tiles, eGadget, PTA 8484 SMS link, declaration print, owner override);
- thermal/A4 receipt wala sale wizard;
- sales/purchases detail, return aur void ke saath;
- loans, settings, `wa.me` share wali notifications, live dashboard.

Verify: `tsc` clean, 10 vitest, build ok. Us waqt verify nahi hua tha: asal phone layout, Android camera, thermal printer.

## A6. Phase 2: rozana ke kaam (sessions 16–18)

- **Expenses + day close** (`16fec8d`): 11 seeded bilingual categories, `EXP-` numbering, din band karte waqt expected vs counted cash.
- **Repairs** (`b85027d`): customer ya stock ka phone, EN/UR fault codes, status log, parts + labour, advance aur delivery ledger se, bahar ke technician ki cost device cost mein, job sheet print, repair-ready WhatsApp.
- **Accessories** (`e78bc30`): weighted average cost wala stock, movements, purchase/sale/return/void/repair se jura hua, low stock, baqi accessories ka tracker.
  → **103 tests.**
- **Exchange** (`5082737`): trade-in khareed + sale + optional refund **ek hi** transaction mein (test sabit karta hai ke fail hone par koi adhoori row nahi bachti). **Reports**: dashboard, profit & loss, cash flow, tax, stock ageing. → **107 tests.**
- In sab ki screens (`1e2ad2f`), aur staff management aur cash/bank accounts (`466e2c0`).

## A7. Pehla deployment setup aur Easypaisa jaisa home (sessions 19–24)

**Session 19** (`2218ef5`, ADR-008): owner ke Hostinger VPS ke liye Docker Compose — PostgreSQL 16 + FastAPI + Caddy (automatic HTTPS), raat ka `backup.sh`, aur production mein default `SECRET_KEY` par start hone se inkar. 108 tests. Dev PC par Docker nahi tha, is liye stack sirf offline PostgreSQL SQL render karke check hua (35 tables).

**Session 20** (`1d6f6c4`): owner ne **Easypaisa ke screenshots UI guide** ke taur par diye. Home usi style mein bana (green header band, aankh wale toggle se chhupi raqam, services grid). Saath mein lockout wala PIN login (10 min mein 5 ghalat) aur dukaan mein pehle se pare phones ke liye opening stock page. Yahan bug mila: dev backend reload hona band ho gaya tha, is liye naye endpoints 404 de rahe the — restart se theek hua (yeh masla kai dafa wapas aya). 110 tests.

**Session 21**: `npm run dev:lan`; owner ne Wi-Fi par Android phone par app khola: **"UI ok hai."** Sabaq likha gaya: owner ke demo account par test credentials (test PIN) mat chhoro.

**Sessions 22–23**:
- stock offer-style cards;
- UTF-8 BOM wale CSV exports taa ke Excel Urdu dikhaye (113 tests);
- install hone wala PWA (service worker sirf app shell cache karta hai, `/api` kabhi nahi);
- Capacitor 6 Android scaffold (`pk.mobileshop.app`);
- Pixel 7 size par pehla Playwright E2E (core flow 22 s mein pass).

**Session 24 — owner ki testing ke fixes** (log mein sab 2026-10-22):
- "Add device kaam nahi kar raha":
  1. ek i18n key `stock.condition` ne labels ka poora namespace overwrite kar diya tha;
  2. phone par `http://<PC-IP>` secure context nahi, is liye `crypto.randomUUID` mojood nahi tha aur button error de deta tha.
  Fix: `uid()` helper. E2E ab `randomUUID` hata kar phone jaisa chalta hai. Rule: HTTPS se pehle secure-context wali browser APIs fallback ke baghair nahi.
- "Purchase bohat mushkil hai": shuru mein sirf do bari choices — **Dealer se** / **Customer ka phone khareedein** — aur customer wali khareed ke baad "Skip, main is bande ko janta hoon".
- "Ek naam, ek phone": alag Urdu naam aur WhatsApp fields khatam.
- Brands/models/storage/colours: device form se add, shop ke apne rows ka rename/delete.
- Purchase ki date-time, kyun ke masroof dukandar baad mein entry karta hai.
- E2E 3 se 5 tests.

## A8. Edit/delete, phir UI dobara reject → "Dukaan counter" (2026-10-26, session 25)

**Har cheez edit aur delete** (`d348102`, `6720e2e`). Rule "delete ya archive" hai:
- jis record ki history hai woh chhup jata hai magar rehta hai;
- jis par paisa baqi ho ya stock bacha ho, woh delete nahi hota.

Backend **127**, Playwright 8.

**UI phir reject hua.** Owner + 10 testers: *aasaan nahi, Easypaisa ki copy (payment app) lagti hai*. Bataye gaye masle: zyada steps, alfaaz samajh nahi aate, cheezein milti nahi, home bhara hua.

Owner ne "Dukaan counter (POS)" direction chuni aur zaroori sawalon ki list di:
- main ne kitna dena hai / lena hai aur kis se;
- stock kitne ka hai, brand aur model ke hisaab se;
- stock daalna;
- bechna (udhaar par bhi);
- kisi bhi din ki sale aur udhaar.

Mockup approve hone tak code nahi likha gaya — phir owner: **"ok start karo."**

Bana (`f6a2f5a`, `fa4ed6a`, `4108adc`; ADR-009, docs/11 v2):
- har kaam ka ek rang wala tile, ek seedha lafz;
- home khud owner ke sawalon ka jawab deta hai;
- `/reports/stock-summary` aur `/reports/day`;
- sale teen steps mein (kaunsa phone → kitne ka aur kaise paise → ho gaya);
- laptop par F-keys wala side menu.

Backend 129, vitest 14, Playwright 11.

Usi din aage (owner: **"baqi kaam start, return module bhi"**, phir **"next kaam start"**):
- **Cut ke saath wapsi** (`435f5ff`): owner ka case — 100,000 ka phone wapas aya, shop ne 10,000 kaata aur 90,000 wapas diye. Refund aur rakhi hui raqam ab ek saath ho sakti hain; walk-in cash sale bhi wapas ho sakti hai agar laane wale ka naam ho. Backend 130, Playwright 12.
- **Stock daalna teen steps mein** (`b333fa1`); baqi screens par v2 rang aur seedhe alfaaz ("ID card check", "Dealer", "Naya banda"). Playwright 13.
- **Owner reports** (`c3d5cd7`, `37a025f`):
  - kharchon ke baad munafa;
  - sab se zyada bikne wale;
  - 7 din ka andaza (pichle 4 hafton ka wohi din) aur kaunsa phone khatam hone wala hai;
  - kis ne becha / kis ne stock daala;
  - koi bhi salesman *pending* ID check skip kar sakta hai (*flagged* phone ke liye ab bhi owner/manager).

  Backend 133, Playwright 14.
- **Repair teen steps mein** (`84a9f8a`): lo → theek karo → wapas do. Playwright 15.
- **Har action par icon** (owner: **"icon use karo, simple text samajh nahi aa raha"**, phir **"jahan sirf icon hai wahan naam bhi likhein"**): har action icon *aur* lafz wala button (`6124c68`, `1d5eb30`). docs/11 mein rules 6–7.
- Pending check ki wajah se sale ruki → ab bechne wala sale par bhi skip kar sakta hai (`e3495dd`). Backend 134, Playwright 16.
- Home aur saada, har card par "See details ›" (owner: **"modern aur simple, har card par see details"**, `e95c3ca`).

## A9. Downloads aur "haath mein cash" ka sawal (2026-10-26)

- Owner: **"pdf, excel, csv sab mein report download ka option."** Har report CSV (BOM ke saath), Excel (openpyxl se `.xlsx`) ya PDF mein. Faisla: server par PDF library nahi, kyun ke wahan Nastaliq theek nahi banti. "PDF" ek print-ready page hai jo browser PDF mein save karta hai, bilkul receipts ki tarah (`057ca1c`). Playwright 17.
- Bug: wapsi ka amount box saaf karne par khud dobara bhar jata tha (`ac262e7`).
- Bug: wapas aya phone din ke hisaab aur home mein ab bhi bika hua gina ja raha tha (`e0a21d4`). Backend 135.
- Owner ka sawal: 800,000 ki sale, wapsi par 750,000 wapas diye — "cash received" kya hai? Jawab: 800,000 aye, 750,000 gaye, 50,000 haath mein. Din ki report mein money in / out / net aur "Aaj haath mein kitna" add hua (`5843a27`).
- Phir owner ne −700,000 dekha. Us ka dev data sirf parh kar check kiya gaya: usi din 750,000 ki stock khareed ka paisa bhi diya gaya tha, to number sahi tha. Ab page batata hai ke paisa kahan se aya aur kahan gaya, wajah ke saath (`14ace2d`), aur ek test owner ka wohi din dobara banata hai.

## A10. Roman Urdu, Urdu ki safai, aur look "Modern" par tika (2026-10-26)

- **Roman Urdu teesri zubaan** (ADR-010, `5e09b5b`): locale `roman`, wohi keys (801 keys, helper agent ne likhin, review hui). Home header par zubaan aur Light/Dark buttons. Kami: server ka text (errors, prints) Roman mode mein English/Urdu hi rehta hai.
- Owner: **"Urdu ko theek karo, Urdu ke format ko bhi."** Naya `e2e/urdu.spec.ts` screens Urdu mein chalata hai aur English lafz aane par fail hota hai. Ab Urdu huroof Nastaliq mein aur Latin huroof/digits har jagah Manrope mein (`c5b684d`). Pehle hi `.num` Manrope par lagaya gaya tha kyun ke Nastaliq 0 ko nuqta bana deta tha.
- Hafte, is mahine, ya kisi bhi from–to period ka hisaab (`385ceb8`).
- Testers: pastel tiles **"school ke bachon ka software lagta hai, professional nahi"** → ek hi tokens par teen looks: Professional, Navy, Colorful (`46c4c8e`).
- Phir owner ne **Stripe aur Google se inspired** UI chuna: **"Modern"** look default bana (ADR-011, `8cb7e41`): Inter font, Stripe navy, ek blurple accent, hairline cards aur halka shadow, active tab par Material pill. Baqi looks owner ki tasdeeq tak rakhe gaye hain.

UI ki poori kahani ek line mein: v1 prototype ("not modern, not luxury", ~50 dukandar) → Emerald & Gold (ADR-007) → Easypaisa jaisa home (owner ke screenshots se) → owner + 10 testers ne reject kiya → Dukaan counter (ADR-009) → teen looks → **Modern** (ADR-011).

## A11. Super admin, public signup band (2026-10-26)

Owner: login page par "shop banao" nahi hona chahiye; sirf product owner shops kholega. ADR-012 (`2a5f389`):
- `PUBLIC_SIGNUP` (default false) signup rokta hai;
- super users woh numbers hain jo `SUPERUSER_PHONES` mein hain;
- `/api/v1/admin/shops` se shops ki list aur nayi shop kholna;
- More → Super admin ke aakhir mein naye owner ka login aur WhatsApp share.

Login page par maker footer: OOP Solutions, oopsolutions.com, Abdur Rehman Afzal +92 316 4001668. Backend 139, Playwright 22.

## A12. Baqi screens, poora catalogue, field checks (2026-10-27, sessions 26–27)

**Session 26** (owner: **"ok start next kaam"**):
- settings teen cards mein;
- bug: save ki hui tax/receipt settings dobara kholne par khaali dikhti thin;
- tight line-height se Urdu labels kat rahe the (ab 1.7);
- exchange aur loans ki ek line ki wazahat.

**Session 27** (owner: **"saare latest models, storage, colour pehle se add karo; purchase price sell price se kam na ho; phone number mein country code; CNIC 13 digit; IMEI length; from date to date se aage na ho"**) (`db73321`):
- catalogue 108 → **465 models**, colours 16 → 37, 16GB storage add (sab se naye model names log mein "kam yaqeeni" likhe hain);
- bechne ki qeemat khareed se kam nahi (owner/manager sale par "I know — sell at a loss" se override kar sakte hain);
- `PhoneInput` (+92 fixed), `CnicInput` (13 digits, dashes khud), `ImeiInput` (15 digits);
- date range: from ≤ to ≤ aaj, backend `bad_date_range`.

vitest 20, Playwright 22.

**Accessories redesign** (`905587f`): "came with device / pending from vendor" dukandaron ko confuse karta tha. Ab har item ki teen bari choices — **Nahi · Mil gaya / De diya · Baad mein** (date ke saath) — aur warranty chips seedha sale par. Playwright 23.

**Stock filter buttons ki shakal mein** (`3d600b2`), kyun ke Android ka apna dropdown rang mila deta tha.

## A13. IMEI barcode scan aur Android camera reload ka masla (2026-10-27)

Owner ne IMEI boxes mein barcode scan aur ID check par phone ki photo maangi (`38e067b`):
- zxing (sirf scan ke waqt load hota hai);
- jahan ijazat ho live camera, warna photo se barcode parhna;
- sirf 15 digit aur Luhn pass karne wale codes maane jate hain, is liye EAN/serial barcodes ignore;
- jis label par do IMEI hon, dono choose karne ke liye milte hain.

**Masla 1 — form reset.** Owner ke phone par `*#06#` screen ki photo se kuch nahi hua aur add-stock wizard shuru par chala gaya. Wajah: plain-http Wi-Fi link par browser page ke andar camera nahi khol sakta, Android camera app kholta hai aur Chrome page reload kar deta hai, state khatam. Fixes (`1a322c6`):
1. `npm run dev:phone` — port 5174 par https (self-signed certificate), taa ke camera page ke andar khule;
2. `useDraft` form ki state sessionStorage mein (30 min) rakhta hai aur save ke baad mita deta hai;
3. scan aur sakht (bilkul 15 digits + Luhn, taa ke 32 digit EID kabhi match na ho).

**Masla 2 — bharay hue box labels.** iPhone box ki photo (EID, serial aur IMEI qareeb qareeb) se IMEI nahi mila: har scan strip mein kai barcodes the aur zxing EID de deta tha. Fix (`f6ab32c`): patli strips (height ka 1/16), aadhi strip ke qadam, sirf Code 128/39, do IMEI par ruk jao; live camera bhi yehi tareeqa use karta hai. Owner ki photo phir ~0.09 s mein parhi gayi (local check hua; photo commit nahi hui kyun ke us mein asli IMEI hai). Playwright 25, fake-camera live-scan test samet.

**Masla 3 — ghalat waqt par draft wapas.** Add stock seedha step 2 par khul raha tha kyun ke normal visit par purana draft wapas aa jata tha. Ab draft sirf asal browser reload ke baad wapas aata hai (`baf1596`).

## A14. Live hona: VPS, Traefik, CI/CD (2026-10-27)

**Shared server ke liye rework** (`5df4a78`, ADR-013). Owner ke saare projects ek Hostinger VPS par Docker mein, pehle se chalte Traefik ke peeche chalte hain, aur GitHub Actions restricted `deploy` user se SSH karke deploy karta hai (OOP Solutions website wala tareeqa). Purana compose 80/443 par apna Caddy chalata tha jo Traefik se takrata.

Naya design:
- stack koi port nahi kholta;
- `web` (Caddy :80 par: built SPA + `/api` proxy) labels ke saath Traefik ke network mein;
- db aur backend private `internal` network par; backend ka alias `mobileshop-backend` taa ke kisi aur app ke "backend" se na takraye;
- `ci.yml` develop/PRs par: ruff + pytest, PostgreSQL 16 par Alembic up/down/up, typecheck + vitest + build, phir asli production images ek saath + `deploy/ci/smoke.sh`;
- `deploy.yml` main par push se: CI → commit tag ke saath ghcr.io par images → `ssh deploy@VPS "sudo -n /opt/mobileshop/deploy.sh <sha>"` (pull, up, health check, khud rollback);
- `setup-vps.sh` (ek dafa): `/opt/mobileshop`, generated secrets wala root-only `.env`, ek command ka sudoers rule, raat ka backup cron.

**CI ne PostgreSQL migration bug pakra** (`2c2b538`). Pehle CI runs fail hue kyun ke migration `ab0e2601f475` ka downgrade foreign key ghalat naam se drop kar raha tha — SQLite ko pata hi nahi chala. Downgrade theek hua aur `pgserver` ke zariye local PostgreSQL 16 par verify hua.

Smoke script bhi ek fail step chhupa rahi thi (`&& echo`) aur ghalat field names use kar rahi thi; ab har step ka pass hona zaroori hai. `TEST_DATABASE_URL` se test suite PostgreSQL par chal sakti hai. `69f4597` par CI: backend, frontend aur poora Docker stack + smoke, sab green.

**DNS aur pehla certificate.** Owner ne `mobileshop.oopsolutions.com` VPS par point kiya, `setup-vps.sh` chalaya aur GitHub secrets daale. Pehle wala merge to main checks par ruk gaya tha, kuch deploy nahi hua. `6cec924` wala deploy run checks, images aur VPS deploy mein green tha; sirf aakhri URL check curl exit 60 se fail hua, kyun ke Traefik ne abhi certificate jaari nahi kiya tha. Ab check 2 minute tak dobara koshish karta hai. `/health` → prod, http → https 301. **2026-10-27 ko live.**

**Pehla login.** Production mein signup band hai, is liye andar jaane ka koi rasta nahi tha. Nayi command `python -m app.cli create-owner` (shop, naam, number aur password getpass se poochti hai; `test_cli.py`) (`2847efa`). Release `00e67d0` deploy hui (sab green); owner ne server par is se super admin banaya aur login kiya.

## A15. Android APK CI mein (2026-10-27)

Dev PC par Java ya Android SDK nahi, is liye `android.yml` APK GitHub par banata hai (`4aa2437`):
1. `npm run build:native` — service worker ke baghair `vite --mode native`, `VITE_API_URL` = `vars.APP_URL`, `cap sync`;
2. `gradlew assembleRelease`, secrets se sign (secrets na hon to debug-signed test APK);
3. APK run artifact ke taur par (90 din). Version code = run number.

App icon aur splash `frontend/assets` se `@capacitor/assets` ke zariye. Pehla version jo public GitHub Releases publish karta tha, permission check ne mana kar diya, is liye APK sirf artifact hai.

**Bug:** `build.gradle` mein Groovy call precedence ki wajah se gradle version aur key password ghalat parh raha tha (`98ecb0a`). Fix ke baad **APK 1.2** release-sign hua, owner ne phone par install kiya, aur woh live API ke saath khulta aur chalta hai (`0b8b5ab`).

Kami: Android WebView ke andar print aur download abhi kuch nahi karte (docs/13).

---

# Part B — Zero se dobara banana

Yeh woh tarteeb hai jo kaam aayi. Tafseeli commands [`04-DEVELOPER-MANUAL.md`](04-DEVELOPER-MANUAL.md), [`../../12-DEPLOYMENT.md`](../../12-DEPLOYMENT.md) aur [`../../13-MOBILE-APP.md`](../../13-MOBILE-APP.md) mein hain. Yahan sirf ahem commands hain.

## B1. Install karne wale tools
- Git; Python **3.12**; Node **22** (jo CI use karta hai) aur npm.
- E2E ke liye Playwright Chromium (`npx playwright install chromium`).
- Local par optional: Docker (asal dev PC par nahi tha — stack pehli dafa CI mein chala), Java 17 + Android SDK (zaroorat nahi — APK CI banata hai).
- Windows: Python se pehle hamesha `set PYTHONUTF8=1`, warna cp1252 par Urdu output crash karta hai.

## B2. Repo, branch aur project rules
1. Repo banao; `main` = releases, `develop` = rozana ka kaam.
2. Repo-local git author set karo (`git config user.name` / `user.email`); project rule: ek hi insaani author, koi AI attribution nahi (ADR-006).
3. LF line endings ke liye `.gitattributes`; Windows `.bat` files CRLF rahein (`0062e08`, `b58eddf`).
4. Code se pehle docs likho:
   - `CLAUDE.md` (hard rules);
   - `docs/01–07` (FR ids wali requirements, architecture, data model, roadmap, progress, testing);
   - `09-SESSION-LOG.md` aur `10-DECISIONS.md`.

   `kickoff` / `handoff` / `pk-mobile-domain` skills banao taa ke har session progress + log se shuru ho aur unhein update karke khatam ho.
5. Agar purana prototype hai to usay `legacy/` mein rakho aur audit karo (docs/08), usi ko aage mat barhao.

## B3. Backend skeleton
```
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -e .[dev]
set PYTHONUTF8=1
.venv\Scripts\alembic upgrade head
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```
Yeh cheezein lagao: app factory, settings, bilingual error envelope, aur SQLAlchemy 2 base jis mein UUID keys, timestamps, `ShopScoped` mixin aur `Numeric(14,2)` money ho (float kabhi nahi). Saath mein Alembic aur in-memory SQLite par pytest.

## B4. Tenancy aur auth (har feature se pehle)
- Organisations → shops → users/user_shops;
- JWT access + refresh, bcrypt;
- `X-Shop-Id` context jo user ki shops se check ho;
- role → capability matrix, audit log.

Leakage test foran likho: do shops, ek mein kaam karo, check karo ke doosri ko kuch nazar na aaye. Baad mein lockout wala PIN login, `PUBLIC_SIGNUP=false` aur super users (`SUPERUSER_PHONES`, ADR-012).

## B5. Modules, isi tarteeb se
1. Catalogue + idempotent seeds (startup par chalte hain).
2. Parties + Pakistani validators (phone, CNIC, IMEI Luhn).
3. **Ledger** — `Posting` builder, balanced groups, `reverse()`, statements, cash book, aur Σdebit = Σcredit ka property test.
4. **Devices + device_events** — transition table; status sirf `apply_event()` likhta hai.
5. Verification + file uploads (flagged par sale band).
6. Purchases → 7. Sales (tax, COGS, receipt) → 8. Payments (FIFO allocation) → 9. Loans → 10. Returns.
11. Notifications outbox (pehle `wa.me` links).
12. Expenses + day close → Repairs → Accessories (weighted average cost) → Exchange (ek transaction) → Reports → Exports (BOM wala CSV, xlsx, print-PDF).
13. Admin (super admin shops kholta hai) aur server par pehle login ke liye `create-owner` CLI.

Har module apni Alembic migration aur tests ke saath aata hai. Named foreign keys rakho (SQLite batch mode) aur migrations **PostgreSQL** par bhi up/down/up chalao — yehi bug CI ne pakra tha.

## B6. Frontend skeleton, design system, i18n, screens
```
cd frontend
npm install
npm run dev        # http://localhost:5173 (/api ko :8000 par bhejta hai)
npm run dev:lan    # usi Wi-Fi par phone, http
npm run dev:phone  # 5174 par https (self-signed), taa ke camera page ke andar khule
```
1. Vite + React 18 + TypeScript + Tailwind, TanStack Query, zustand, i18next.
2. **Design pehle mockup se approve karwao.** Tokens CSS variables mein (light/dark), font aur radius bhi tokens, taa ke "look" inhein badal sake. `docs/11-DESIGN-SYSTEM.md` follow karo: ek kaam = ek rang = ek lafz, zyada se zyada teen steps, dukaan ke alfaaz, har action icon + lafz wala button, tap hone wale card par "See details ›".
3. i18n: `en.json`, `ur.json`, `roman.json`, wohi keys. Ek waqt mein ek hi zubaan; Urdu RTL Nastaliq aur Latin digits Manrope mein. Jo key pehle se namespace ho usay dobara kabhi use mat karo.
4. Screens backend wali tarteeb mein, sirf shared primitives se (`BiLabel`, `BiButton`, `BiInput`, `Sheet`, `RemoveSheet`, `FieldInputs`, `ScanButton`, `DownloadButton`…).
5. Phone ki hifazat: secure-context wali APIs fallback ke baghair nahi (`uid()`); lambe forms ke liye reload-safe drafts (`useDraft`).
6. `vite-plugin-pwa` se PWA (sirf app shell, `/api` kabhi cache nahi).

## B7. Testing setup
- Backend: `.venv\Scripts\pytest -q`, `ruff check app tests`; `TEST_DATABASE_URL` se suite PostgreSQL par.
- Frontend: `npm run typecheck`, `npm test` (vitest), `npm run build`.
- E2E: `npm run e2e` (Playwright, phone viewport; backend chal raha ho). Ek Urdu walk jo English lafz aane par fail ho, aur ek fake-camera scan test shamil karo.
- Routes add karne ke baad dev backend restart karo — asal PC par reloader aksar unhein miss karta tha. Agar route phir bhi 404 de to dekho ke :8000 par koi doosra process to nahi sun raha.

## B8. Docker images
- `backend/Dockerfile`: python 3.12 slim, non-root, start par migrations, healthcheck.
- `deploy/web.Dockerfile`: Vite build → Caddy jo SPA serve kare aur `/api` proxy kare.
- `deploy/docker-compose.yml`: `db` (postgres:16-alpine), `backend`, `web`; koi port publish nahi; `web` labels ke saath Traefik ke network par.

Production mein backend default `SECRET_KEY` par start nahi hota aur `/docs` chhupa deta hai.

## B9. VPS, Traefik aur DNS
Aisa VPS chahiye jahan Traefik pehle se 80/443 sambhalta ho aur `deploy` user mojood ho. Root ke taur par:
```
git clone --depth 1 https://github.com/AbdurRehmanAfzal/mobile-shop-software.git /tmp/ms
bash /tmp/ms/deploy/setup-vps.sh     # /opt/mobileshop, naye secrets wala .env, sudoers rule, backup cron
nano /opt/mobileshop/.env            # APP_DOMAIN, SUPERUSER_PHONES
```
DNS: app ke subdomain ka A record → VPS ka IP.

## B10. GitHub secrets aur CI/CD
- Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Variable: `APP_URL`.
- `ci.yml` develop par har push par chalta hai. Release = `develop` ko `main` mein merge karke push; `deploy.yml` ghcr.io par images banata hai, phir VPS par `deploy.sh <sha>` chalata hai (health check + rollback).
- Pehle run mein certificate jaari hote waqt sirf aakhri URL check fail ho sakta hai; check 2 minute tak dobara koshish karta hai.

## B11. Pehla login
```
cd /opt/mobileshop && docker compose exec backend python -m app.cli create-owner
```
Woh number use karo jo `SUPERUSER_PHONES` mein hai. Phir domain kholo, login karo, aur More → Super admin se customers ki shops kholo.

## B12. Android APK
1. Release key ek dafa banao aur hamesha sambhal kar rakho (docs/13 mein VPS par JDK container ke andar `keytool` wali command hai).
2. Secrets daalo: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`.
3. **Actions → Android** chalao (ya main par push karo); artifact download karke phone par install karo.
4. Keystore aur us ke password ki copy server se bahar rakho — kho gayi to update kabhi nahi ho sakega.

## B13. Backups
`setup-vps.sh` raat ka cron (02:30) lagata hai: `pg_dump` + uploads `/opt/mobileshop-backups` mein, 14 din tak. Restore `pg_restore` se (docs/12). Backups server se bahar regular copy karo — log ke mutabiq yeh abhi baqi hai (rclone tajweez hai).

---

# Part C — Sabaq aur aage kya hai

## Sabaq (session log se)
1. **Features se pehle buniyad.** Tenancy, decimal money, append-only ledger aur device events ki wajah se baad ke features (cut wali wapsi, "haath mein kitna" ki wazahat, history) patch nahi karne pare, samjhaye ja sake.
2. **Asal dukandaron se jaldi aur baar baar poocho.** UI do dafa reject hua (v1 par ~50 dukandar; Easypaisa jaise home par owner + 10 testers) aur do dafa aur nikhra (looks → Modern). Code se pehle mockup approve karwane se dobara kaam bacha.
3. **Dukaan ke alfaaz aur nazar aane wale buttons.** "Simple text samajh nahi aa raha" se yeh nikla: har action icon aur lafz wala button; har card par "See details".
4. **Asal phone par, asal network par test karo.** Localhost ne do bugs chhupaye: http par `crypto.randomUUID`, aur camera app khulne par Android ka page reload.
5. **Production database par migrations CI mein chalao.** Downgrade mein ghalat FK naam SQLite ne nahi pakra; CI wale PostgreSQL ne pakra.
6. **Smoke test zor se fail ho** — ek `&& echo` ne fail step chhupa diya tha.
7. **Jo i18n key pehle se namespace ho usay dobara mat use karo**; UI badalne ke baad E2E chalao.
8. **Owner ke demo account par test credentials mat chhoro.**
9. **Routes ya Tailwind badalne ke baad dev servers restart karo**; :8000 par bache hue process dekho.
10. **Number sirf dikhao nahi, samjhao.** −700,000 "haath mein" sahi tha; hal yeh tha ke paisa aane aur jaane ki wajah dikhayi jaye.

## Khule sawal (log mein darj)
- Price rule ki samajh: bechne ki (asking) qeemat ≥ khareed — owner ne tasdeeq karni hai.
- Catalogue mein sab se naye model names ghair yaqeeni hain.
- Kya expense void din ke in/out tiles se net out hon?
- Modern ki tasdeeq ke baad baqi looks hatana.

## Aage kya (progress aur aakhri log entry se)
- Owner phone par live app test kare (https par live IMEI scan, ID photos, Urdu).
- Backups server se bahar copy karna (rclone).
- Android app ke andar print aur download (WebView ki kami).
- Maloom E2E flake: load ke waqt `admin.spec.ts`.
- Owner chahe to laptop par side-by-side sale screen.
- Phase 3: plans aur multi-shop, audit viewer, Meta WhatsApp / SMTP senders, signup par phone OTP, login limiter ko process memory se bahar le jana, offline installer (owner faisla karega), iOS (Mac chahiye).
- Phase 4: AI assistant / OCR, FBR POS, cloud sync.

Plan prices, Meta Business account aur Play Store listing ke baare mein log mein kuch darj nahi; yeh abhi khule hain.

---

## Appendix — Test counts ka record (jaisa log mein hai)

| Kab | Backend pytest | Vitest | Playwright |
|---|---|---|---|
| S1 foundation | 17 | 7 | – |
| S3 design system | – | 9 | – |
| S4 catalogue | 24 | – | – |
| S5–S12 core | 32 → 43 → 52 → 57 → 63 → 72 → 79 → 84 | – | – |
| S14 notifications | 89 | – | – |
| S15 screens | – | 10 | – |
| S16–S17 phase 2 | 103 → 107 | – | – |
| S19–S22 | 108 → 110 → 113 | – | 1 (S23) |
| S24 fixes | darj nahi | 11 → 12 | 3 → 4 → 5 |
| S25 (2026-10-26) | 127 → 129 → 130 → 133 → 134 → 135 → 139 | 12 → 14 → 16 | 8 → 11 → … → 22 |
| S27 (2026-10-27) | "all passed" | 20 → 22 | 22 → 23 → 24 → 25 |
