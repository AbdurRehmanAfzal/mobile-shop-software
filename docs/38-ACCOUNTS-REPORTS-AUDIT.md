# 38 · Accounts & Reports — what exists, what is missing, what comes next (owner brief 2026-11-18)

The owner's brief asks for a complete Accounts and Reports module, built on what is already there,
without disturbing the shops that are live. This is the audit it asked for first: every item of the
brief against the code, then the phases. ADR-104 records the decision.

**How the books work (found in the code, not changed):**
- **Double entry.** Every document (sale, purchase, return, payment, expense, transfer, repair …)
  posts one balanced group to an append-only ledger (`ledger/service.post`). A correction is a
  reversing group linked to the one it reverses. Nothing is edited or deleted.
- **Balances are derived.** A person's khata, a money account's balance, stock at cost, profit —
  all are sums of ledger lines (`parties.balance` is a cache of the ledger).
- **Costing.** A phone is costed by its own unit (the cost on its purchase line). Counted items
  (accessories) leave oldest batch first (FIFO), or by the shop's chosen method (`shops.item_prefs`).
- **Each branch is a shop** with its own stock, khata and books; branches of one owner share an
  organisation. A transfer between branches moves stock at cost through an equity account, never
  as a sale.

Legend: ✅ exists · 🟡 partly · ❌ missing · ➕ added in this phase.

## 1. Accounts

| # | Brief | State | Where |
|---|---|---|---|
| 1 | Accounts dashboard | ➕ | New **Accounts** page (`/accounts`): cash in hand, bank and wallets, to get, to give, and a way into every accounts screen. Before: the same figures were spread over Home and Business overview. |
| 2 | Cash in hand, several cash registers | ✅ | Money accounts of kind cash (`ledger/accounts`, More → Cash & bank accounts); each has its own book. |
| 3 | Several bank / payment accounts | ✅ | Kinds bank, Easypaisa, JazzCash, cheque, remittance; opening balance and date per account. |
| 4 | Cash ↔ bank transfers | ✅ | `ledger/transfers`: one account down, the other up; never income or expense. |
| 5 | Income categories | 🟡 | The ledger keeps sales, repair income and other income apart (the cut kept on a return is other income). **Missing:** recording an income that has no bill (delivery charges, a commission) under a named category. |
| 6 | Expense categories and receipts | ✅ | Categories (shop-defined), payment account, staff member, a photo of the receipt (`expenses.receipt_path`). **Missing:** recurring expenses (rent every month). |
| 7 | Customer receivables and ledgers | ✅ | Khata per person, statement, and (ADR-103) the account ledger with bill items. |
| 8 | Supplier payables and ledgers | ✅ | Same khata; due date on a purchase (`purchases.due_date`). |
| 9 | Credit sales and purchases | ✅ | Paid-now and the rest on the khata; due dates on bills. |
| 10 | Partial and advance payments | ✅ | Payments allocate to bills; an unallocated payment is an advance; len-den (money with no bill) is its own purpose. |
| 11 | Chart of accounts | ➕ | New: every account with its balance, grouped as on the balance sheet (`/reports/ledger`). |
| 12 | General ledger | ➕ | New: every line of one account for a period (`GET /reports/general-ledger`), opened from the chart or from a trial-balance line. |
| 13 | Journal entries (manual) | ❌ | Not built — see §4. |
| 14 | Trial balance | ✅ | `GET /reports/trial-balance` (Reports → Balance). |
| 15 | Opening balances | ✅ | Money accounts, people's khatas, old stock. |
| 16 | Account reconciliation | 🟡 | The books prove themselves (`shop-audit/reconcile`: cash, groups, khata caches, stock units, allocations). **Missing:** ticking a bank statement against the bank account. |
| 17 | Daily cash closing | ✅ | Expected against counted cash, the difference recorded (`expenses/day-close`). |
| 18 | Branch-wise accounting | 🟡 | Every branch has its own complete books. **Missing:** one consolidated view over all branches of an owner. |
| 19 | Audit trail | ✅ | `audit_log` for every change, device events, the owner's security feed. |

## 2. Reports

| Area | Brief | State | Where |
|---|---|---|---|
| Sales | Daily / weekly / monthly / yearly, date range | ✅ | Shop Audit → Sales (series by day / week / month), Day's hisaab. |
| Sales | By product, brand, category | ✅ | Shop Audit → Products; Reports → Top sellers, By type. |
| Sales | By customer, by salesman | ✅ | Shop Audit → People (rankings), Staff. |
| Sales | By payment method | ✅ | Shop Audit → Finance → Cash (channels and methods). |
| Sales | Discounts, cancellations, returns | ✅ | Shop Audit → Bills, Returns (ADR-097), Security feed. |
| Sales | Retail versus wholesale | 🟡 | A wholesale customer gets the wholesale price of an item; there is no report splitting sales by retail / wholesale. |
| Sales | By branch | 🟡 | Per branch, yes (switch shop); not side by side. |
| Purchases | By supplier, by product, credit, payments, returns | ✅ | Shop Audit → Sales → Purchases, People, Returns. |
| Purchases | Purchase cost history | 🟡 | Per item: price history (`accessory price history`). Per phone: its own cost on its history. No single "cost over time by model" report. |
| Financial | Profit and loss | ✅ | Reports → Profit; Shop Audit → Finance. |
| Financial | Balance sheet, trial balance | ✅ | Reports → Balance. |
| Financial | Cash flow | ✅ | `reports/cash-flow`; Shop Audit → Finance → Cash. |
| Financial | Cash book, bank book | ✅ | Each money account's book (More → Cash & bank accounts → an account). |
| Financial | General ledger | ➕ | This phase. |
| Financial | Expenses | ✅ | Shop Audit → Finance → Expenses (by category, by staff). |
| Financial | Customer / supplier ageing | ✅ | Shop Audit → Udhaar (age bands, counted from the bill). |
| Inventory | Current stock, valuation | ✅ | Stock, stock worth; ➕ item-wise sheet with cost (ADR-103). |
| Inventory | Stock movements | ✅ | A phone's history; an item's movements and batches. |
| Inventory | Low stock, out of stock | ✅ | Accessories → Reports → Low stock. |
| Inventory | Fast / slow moving, dead stock, ageing | ✅ | Accessories → Reports (movers, dead stock); Reports → Old stock; Shop Audit → Stock. |
| Inventory | Damaged stock | ✅ | Faulty phones (stock filter, Shop Audit → Stock). |
| Inventory | Adjustments, transfers | ✅ | Item adjustments with a reason; branch transfers. |
| Inventory | Branch / warehouse stock | 🟡 | Per branch. No separate "warehouse" concept; a warehouse is a branch. |
| Performance | Customer / supplier outstanding | ✅ | Udhaar khata; Balances. |
| Performance | Salesman performance | ✅ | Shop Audit → Staff. |
| Performance | Best sellers | ✅ | Top sellers; Shop Audit → Products. |
| Performance | Reorder suggestions | ✅ | Reports → Estimate (forecast); item reorder levels. |
| Performance | Branch comparison | ❌ | With the consolidated view (§3, phase 2). |

**Report UX** (date range, filters, export, print): the Shop Audit has one period for all its
sections, PDF / Excel downloads per section, and search in its lists. Reports are limited by role
(`REPORTS_ALL`, `VIEW_COST`) and by shop on every route.

## 3. Phases

**Phase 1 — done now (read-only, no migration):**
- Account ledger of one person with bill items, and the item-wise stock sheet (ADR-103).
- Chart of accounts and general ledger; a trial-balance line opens its entries (ADR-104).
- The Accounts page.

**Phase 2 — proposed, each small and additive (the owner chooses the order):**
1. **Other income with categories** — record delivery charges, commission and the like without a bill; posts to other income with its category; shows in profit and loss.
2. **Recurring expenses** — rent, salaries, internet: the app offers them each month to confirm (never posts by itself).
3. **Consolidated view for an owner with branches** — sales, profit, cash, stock, to get / to give per branch and in total, side by side.
4. **Retail versus wholesale** in the sales report.
5. **Customer credit limit** — a limit on a person's khata; a warning (owner can allow) when a sale goes over it.

**Phase 3 — later:**
- Bank reconciliation: tick a bank statement's lines against the bank account.
- Purchase cost history by model.

## 4. Manual journal entries — not built, and why

The brief lists "Journal entries: manual accounting adjustments". Every figure in this system is
derived from documents; a free journal entry would let someone move stock value, a khata or cash
with no document behind it, and the rule "every figure can be traced to a bill" would stop being
true. The cases a shopkeeper needs are already documents: a transfer between accounts, an opening
balance, an expense, len-den, a stock adjustment with a reason, deleting a wrong entry. If an
accountant needs a year-end adjustment, the safe form is a small, owner-only "adjustment" document
limited to named accounts, with a reason, kept in the audit trail — a decision for the owner
(listed in `docs/29`).
