# Owner brief (2026-10-30): Shop Audit, Financial Intelligence & Advanced Reporting

> Pasted by the owner on 2026-10-30, saved verbatim as the reference for the next body of work.
> Status: **not started** (see `06-PROGRESS.md`). The audit of the existing codebase (section 1 /
> "Starting instruction") comes first and its findings go to `09-SESSION-LOG.md` and an ADR.

---

# Claude Code — Upgrade Existing Mobile Shop Software with Complete Business Audit, Financial Intelligence & Advanced Reporting

## ROLE & OBJECTIVE

Act as a Senior Software Architect, Financial Systems Engineer, Database Architect, Business Intelligence Engineer, Security Auditor, and Senior Full-Stack Developer.

I already have an existing Mobile Shop Management Software with many features implemented.

**Your task is NOT to create a new application or rebuild the existing software.**

Your task is to inspect the entire existing codebase, understand the current database and business workflows, identify what has already been implemented, and upgrade the existing software with a comprehensive Shop Audit, Financial Reporting, Inventory Intelligence, and Business Analytics System.

The owner should be able to select any date or date range and understand exactly what happened in the business.

The software must answer:

- What did we purchase, and from whom?
- What did we sell, and to whom?
- How much money did we earn or lose?
- How much cash do we have?
- How much money is in each bank account?
- How much do we owe customers and suppliers?
- How much do customers and dealers owe us?
- How much was received or paid through cash, bank, or international transfers?
- What is our current and historical stock?
- Which products are performing best?
- Which products are not selling?
- Which employees performed transactions?
- What taxes were collected and paid?
- How many invoices were generated?
- Which transactions or stock items need attention?

**Core principle: Every displayed amount, statistic, chart, and report must be traceable to actual records in the existing system.**

---

# 1. FIRST: AUDIT THE EXISTING CODEBASE

Before implementing anything:

1. Explore the existing project structure.
2. Identify the technology stack, frontend framework, backend framework, database, authentication system, and reporting libraries.
3. Inspect existing modules for:
   - Mobile inventory
   - Purchases
   - Sales
   - Customers
   - Dealers/suppliers
   - Payments
   - Give & Take / Udhaar
   - Invoices
   - Returns
   - Expenses
   - Taxes
   - Device verification
   - Employee management
   - Dashboards and reports
4. Identify existing relationships and transaction histories.
5. Check how balances, profit, stock quantities, and payments are calculated.
6. Identify reusable APIs, services, components, and database models.
7. Identify missing data, incomplete workflows, inconsistent calculations, and reporting gaps.
8. Prepare a gap analysis showing existing, partially implemented, and missing features.

Do not duplicate existing functionality.

Do not change working features unnecessarily.

Do not invent missing historical data.

Do not perform destructive migrations without approval.

Present the audit findings and implementation plan before major changes.

---

# 2. GLOBAL SHOP AUDIT DASHBOARD

Create or upgrade a dedicated module:

**Shop Audit & Business Intelligence**

This should become the owner's central business monitoring system.

## Global Date Filters

Provide:

- Today
- Yesterday
- This Week
- Last Week
- This Month
- Last Month
- This Year
- Custom From Date → To Date
- All Time
- As-of Date for historical balances

Every report, chart, KPI, and table should respond to the selected date range.

Clearly distinguish:

1. Activity within the selected period.
2. Opening balance before the period.
3. Closing balance at the end of the period.
4. Current balance as of today.

Example:

If the owner selects April 1–30, 2026, the report must show April transactions while also correctly accounting for unpaid balances created before April.

A payment received during April against a March sale must appear in April cash flow, but must not incorrectly increase April sales revenue.

Use consistent timezone and date boundaries.

---

# 3. COMPLETE FINANCIAL AUDIT

## Financial KPI Dashboard

Display:

- Total sales
- Total purchases
- Gross profit
- Gross loss
- Net profit/loss
- Cost of goods sold
- Operating expenses
- Taxes collected
- Taxes paid
- Outstanding receivables
- Outstanding payables
- Cash balance
- Bank balances
- Inventory value
- Total business inflows
- Total business outflows
- Net cash movement
- Opening and closing balances

Clearly distinguish revenue, profit, cash flow, receivables, and payables.

Do not calculate profit simply by subtracting total purchases from total sales.

Use the actual cost of sold inventory, applicable returns, discounts, and expenses.

Support separate gross profit, operating profit, and net profit calculations.

If certain costs or taxes are unavailable, clearly identify the limitation instead of displaying misleading financial results.

## Profit & Loss Report

Show:

- Sales revenue
- Sales returns and discounts
- Net sales
- Cost of goods sold
- Gross profit
- Operating expenses
- Other income/expenses
- Tax expense where applicable
- Net profit/loss

Include daily, weekly, monthly, and custom-period comparisons.

All totals must reconcile with underlying records.

---

# 4. CASH, BANK & PAYMENT CHANNEL AUDIT

The owner must see exactly where money came from and where it went.

## Cash Audit

Display:

- Opening cash
- Cash received from sales
- Cash received against previous debts
- Cash paid for purchases
- Cash paid against previous debts
- Cash expenses
- Cash refunds
- Cash adjustments
- Closing cash

## Bank Audit

Show each bank account separately.

For each bank account:

- Opening balance
- Incoming transfers
- Outgoing transfers
- Customer payments received
- Supplier payments made
- Expenses paid
- Refunds
- Internal transfers
- Closing balance

Support multiple bank accounts.

## International Payment Audit

Track international payment transactions separately, where supported by the existing software.

Display:

- Payment date
- Sender/receiver
- Country, if available
- Payment channel
- Original currency
- Original amount
- Exchange rate
- Converted PKR amount
- Fees
- Net settled amount
- Related transaction
- Reference number
- Status

Do not mix international payments with local bank transfers without clear classification.

## Payment Method Breakdown

Show amounts received and paid through:

- Cash
- Bank transfer
- International transfer
- Digital wallets, if supported
- Other configured payment methods

Include charts comparing inflows and outflows.

Internal transfers between cash and bank must not be counted as business revenue or expense.

Every payment must link to its underlying transaction.

---

# 5. CUSTOMER & SUPPLIER LIFETIME AUDIT

Implement complete customer-wise and supplier-wise reporting.

The owner must be able to select any customer or supplier and view their entire journey from their first transaction up to the selected date.

## Customer Audit

Display:

- Customer creation date
- First transaction date
- Last transaction date
- Total mobiles bought from customer
- Total mobiles sold to customer
- Total transaction value
- Total money received
- Total money paid
- Outstanding receivables
- Outstanding payables
- Returns
- Refunds
- Payment history
- Invoice history
- Complete mobile-wise ledger

Provide a chronological timeline of every activity.

## Supplier/Dealer Audit

Display:

- Supplier details
- First purchase date
- Last purchase date
- All supplied mobiles
- Total purchase value
- Total amount paid
- Outstanding payable
- Any sales to supplier
- Receivables
- Returns
- Refunds
- Payment history
- Invoice history
- Supplier-wise stock contribution
- Profit generated from supplier-sourced mobiles

## Historical Journey

For any selected as-of date, calculate:

- Transactions up to that date
- Payments up to that date
- Outstanding balance at that date
- Items purchased/sold up to that date

Do not include future payments when calculating historical balances.

## Customer & Supplier Rankings

Show:

- Top customers by sales value
- Top customers by purchase frequency
- Top customers by profit contribution
- Top suppliers by purchase value
- Top suppliers by number of devices
- Top suppliers by profit contribution
- Customers with largest outstanding balances
- Suppliers with largest outstanding balances

Rankings must clearly show which metric determines the rank.

Every ranked entry must be clickable.

---

# 6. COMPLETE INVENTORY & STOCK AUDIT

Create an advanced stock intelligence dashboard.

## Inventory Summary

Display:

- Total mobiles in stock
- Total inventory cost value
- Total expected selling value
- Potential gross margin
- Total used mobiles
- Total box-pack mobiles
- Total PTA-approved mobiles
- Total non-PTA mobiles
- Total JV mobiles
- Total verified devices
- Total non-verified devices
- Total verification-skipped devices
- Total sold devices
- Total returned devices
- Total reserved devices, if supported

Use the existing product attributes and category definitions.

Do not assume categories are mutually exclusive.

For example, a device may be both Used and PTA Approved.

## Inventory Category Breakdown

Allow filtering by:

- Brand
- Model
- Device condition
- Box pack / Used
- PTA Approved / Non-PTA / JV
- Verification status
- Supplier
- Purchase date
- Price range
- Stock age
- Availability status

## Detailed Stock Table

For each mobile display:

- Mobile ID
- IMEI
- Brand
- Model
- Category
- Condition
- PTA status
- Verification status
- Purchase source
- Purchase date
- Purchase price
- Current asking price
- Stock age
- Expected margin
- Current stock status

Each mobile row must open its complete existing mobile profile, history, and ledger.

## Most Expensive Inventory

Show:

- Most expensive mobile by purchase cost
- Most expensive mobile by asking price
- Top 10 highest-value stock items
- Highest potential profit mobiles
- Lowest potential margin mobiles

---

# 7. DEVICE VERIFICATION AUDIT

Integrate the existing device verification workflow.

Track:

- Verified devices
- Non-verified devices
- Pending verification
- Failed verification
- Verification skipped
- "I Know This Customer" bypasses

Use the exact existing status definitions.

For every verification action, preserve:

- Mobile
- Customer/supplier
- Employee
- Verification date
- Result
- Verification method
- Skip reason
- Bypass authorization
- Related transaction

Create a dedicated report for verification bypasses.

The owner should be able to see which employee skipped verification and for which customer/device.

Flag unusual bypass activity.

Never treat a skipped verification as a successful verification.

---

# 8. SALES PERFORMANCE & PRODUCT ANALYTICS

Create advanced sales intelligence reports.

## Top Selling Products

Show:

- Top selling brands
- Top selling models
- Top selling categories
- Highest revenue devices
- Highest profit devices
- Highest quantity sold
- Lowest performing models
- Average performing models

Support:

- Day-wise
- Week-wise
- Month-wise
- Year-wise
- Custom date range

For each product/model show:

- Units sold
- Revenue
- Cost
- Gross profit
- Gross margin %
- Average selling price
- Average holding period
- Return count

Define top, average, and low performance using transparent metrics and configurable thresholds.

Do not classify performance using arbitrary unexplained values.

## Sales Trend Charts

Include:

- Daily sales trend
- Weekly sales trend
- Monthly sales trend
- Revenue vs profit
- Units sold by brand
- Units sold by model
- Category-wise sales
- Top 10 models
- Profit by category
- Purchase vs sales trends

Charts must use real data.

Allow clicking chart segments to open filtered transaction lists.

---

# 9. SLOW-MOVING & DEAD STOCK ALERTS

The owner must know which mobiles are sitting in inventory for too long.

Calculate stock age from the date the device entered the current inventory lifecycle.

Suggested configurable thresholds:

- 0–15 days: Fresh Stock
- 16–30 days: Normal
- 31–60 days: Slow Moving
- 61–90 days: High Attention
- Over 90 days: Dead Stock

Do not hardcode these thresholds permanently.

## Stock Aging Report

Display:

- Mobile
- IMEI
- Supplier
- Purchase date
- Days in stock
- Purchase cost
- Asking price
- Potential margin
- Category
- Current status

## Alerts

Generate alerts for:

- Unsold stock exceeding configured age
- High-value slow-moving devices
- Stock with low expected margins
- Devices missing verification
- Repeatedly returned devices
- Unusual stock adjustments
- Negative inventory anomalies
- Stock with missing purchase costs

Each alert must link to the relevant record.

Prevent duplicate or noisy alerts.

---

# 10. EXPENSE AUDIT

Audit all existing expense records.

Display:

- Total expenses
- Expense categories
- Expense date
- Expense amount
- Payment method
- Cash/bank account
- Employee who recorded expense
- Description
- Supporting document, if available

Examples:

- Shop rent
- Electricity
- Salaries
- Repairs
- Transport
- Internet
- Maintenance
- Marketing
- Miscellaneous expenses

Use the existing expense categories where available.

Show:

- Daily expenses
- Weekly expenses
- Monthly expenses
- Category-wise expenses
- Expense trends
- Largest expenses
- Expense comparison with previous periods

Expenses must be correctly included in profit and cash-flow calculations without double counting.

---

# 11. TAX AUDIT

Create or enhance tax reporting.

Display:

- Tax collected on sales
- Tax paid on purchases
- Tax paid through expenses
- Tax adjustments
- Refunds
- Net tax position where applicable

Show sale-wise tax details:

- Invoice
- Mobile
- Customer
- Sale date
- Taxable amount
- Tax type
- Tax rate
- Tax amount
- Payment/filing status, if supported

Use configurable tax rules based on the actual business setup and applicable jurisdiction.

Do not assume every sale has the same tax treatment.

Do not equate tax collected with tax paid to authorities.

Support tax-inclusive and tax-exclusive invoices where relevant.

Maintain an audit trail for tax adjustments.

---

# 12. COMPLETE INVOICE AUDIT

Display:

- Total purchase invoices
- Total sale invoices
- Payment received receipts
- Payment given vouchers
- Return documents
- Refund vouchers
- Credit notes
- Debit notes
- Cancelled/reversed documents

Provide invoice breakdowns by:

- Date
- Customer
- Supplier
- Mobile
- Employee
- Invoice type
- Payment status

Every invoice must be clickable.

The owner must be able to open, print, or download any existing invoice.

Customer-facing and owner-facing invoices must reference the same authoritative finalized transaction.

Never allow conflicting sale amounts between reports and invoices.

---

# 13. GIVE & TAKE / UDHAAR AUDIT

Provide a complete debt management dashboard.

## Receivables

Money customers/dealers owe the shop.

Show:

- Total receivables
- Outstanding invoices
- Party-wise balances
- Mobile-wise balances
- Due dates
- Aging buckets
- Payments collected during period
- Overdue balances

## Payables

Money the shop owes customers/suppliers.

Show:

- Total payables
- Outstanding purchases
- Party-wise balances
- Mobile-wise balances
- Due dates
- Aging buckets
- Payments made during period
- Overdue balances

## Debt Aging

Suggested buckets:

- Not overdue
- 1–7 days overdue
- 8–30 days overdue
- 31–60 days overdue
- Over 60 days overdue

If no due date exists, show "No due date" instead of inventing overdue status.

Show debt opening balance, new debt, payments, adjustments, and closing balance.

Keep payables and receivables separate.

---

# 14. OWNER SECURITY & FRAUD AUDIT

Create an owner-only audit area.

Track:

- Asking-price changes
- Actual selling-price changes
- Discounts
- Sales below allowed minimum
- Invoice cancellations
- Invoice reprints
- Payment reversals
- Manual balance adjustments
- Stock adjustments
- Device verification bypasses
- Suspicious transaction edits
- Unauthorized access attempts, where recorded

Each event must show:

- Employee
- Date and time
- Action
- Related mobile/customer/supplier
- Previous value
- New value
- Reason
- Authorization status
- Related transaction

## Price Integrity

If a mobile originally had an asking price of PKR 40,000 and the salesman updates it to PKR 45,000 before selling:

- Original asking price remains in history.
- New asking price is recorded.
- Actual sale price is recorded separately.
- Customer invoice uses the finalized sale price.
- Owner report uses exactly the same finalized sale price.
- Employee and timestamp are recorded.

No employee should be able to secretly modify finalized transaction values.

Use immutable audit records, server-side authorization, and controlled reversal workflows.

---

# 15. STATISTICS & INTERACTIVE CHARTS

Create a professional analytics dashboard using the existing frontend framework and design system.

Suggested visualizations:

1. Revenue and profit trend — line chart
2. Purchases vs sales — bar chart
3. Cash inflow vs outflow — bar chart
4. Payment methods — donut chart
5. Top selling brands — horizontal bar chart
6. Category-wise inventory — donut chart
7. Stock aging — stacked bar chart
8. Customer/supplier rankings — bar chart
9. Expenses by category — donut chart
10. Receivables/payables trend — line chart
11. Verification status breakdown — donut chart
12. Monthly net profit — bar chart

All charts must:

- Use actual backend data
- Follow global date filters
- Display correct currency formatting
- Support hover details
- Provide useful legends
- Handle empty data
- Support drill-down where practical
- Work on desktop and mobile
- Avoid unnecessary loading of huge datasets

Use existing chart libraries where possible.

---

# 16. CLICKABLE KPI CARDS & DRILL-DOWN

Every major KPI should be interactive.

Examples:

Click "Total Sales" → open sales transactions for the selected period.

Click "Outstanding Receivables" → open customer-wise and mobile-wise receivables.

Click "Cash Balance" → open cash ledger.

Click "Bank Balance" → open bank-account breakdown.

Click "Used Mobiles" → open filtered used-stock list.

Click "Non-PTA" → open filtered non-PTA stock.

Click "Verified Devices" → open verified device records.

Click "Slow-Moving Stock" → open stock aging report.

Click "Top Supplier" → open supplier profile and complete history.

Click "Most Expensive Mobile" → open mobile profile.

The owner must be able to navigate from summary → category → individual transaction → original document.

---

# 17. SEPARATE REPORTS & COMPLETE SHOP AUDIT REPORT

Implement a centralized Report Center.

## Individual Reports

Allow the owner to generate and export:

- Sales Report
- Purchase Report
- Profit & Loss Report
- Cash Flow Report
- Cash Ledger
- Bank Ledger
- Payment Channel Report
- International Payments Report
- Customer Ledger
- Supplier Ledger
- Receivables Report
- Payables Report
- Inventory Report
- Stock Aging Report
- Product Performance Report
- Expense Report
- Tax Report
- Invoice Report
- Verification Report
- Employee Activity Report
- Security Audit Report

## Complete Shop Audit Report

Provide a single comprehensive report containing:

1. Executive Business Summary
2. Financial Performance
3. Profit & Loss
4. Cash & Bank Reconciliation
5. Purchases
6. Sales
7. Customer Analysis
8. Supplier Analysis
9. Give & Take
10. Expenses
11. Tax Summary
12. Inventory Valuation
13. Stock Categories
14. Product Performance
15. Slow-Moving Stock
16. Verification Status
17. Invoice Statistics
18. Employee Activity
19. Security and Fraud Alerts
20. Key Business Insights

Allow:

- PDF export
- Excel export
- Print
- Date-range selection
- Report section selection
- Detailed or summary mode

Include report generation date, selected period, currency, applied filters, and data coverage notes.

Use paginated detail sections or separate worksheets where appropriate.

Ensure exported totals match the dashboard.

---

# 18. HISTORICAL STOCK & FINANCIAL SNAPSHOTS

The owner must be able to audit the business as it existed on a past date.

Example:

"Show my shop's complete position as of April 30, 2026."

The system must calculate:

- Inventory held on April 30
- Cash balance on April 30
- Bank balances on April 30
- Customer outstanding balances on April 30
- Supplier outstanding balances on April 30
- Profit/loss through the selected period
- Stock value on April 30

Do not use today's stock or today's outstanding balances when producing a historical report.

Use transaction history, stock movements, and opening balances.

If historical reconstruction is impossible due to missing legacy records, show a clear data limitation rather than fabricated values.

---

# 19. ACCOUNTING ACCURACY & RECONCILIATION

This module handles business-critical financial information.

Implement reconciliation checks:

- Cash opening + inflows − outflows = cash closing
- Bank opening + inflows − outflows = bank closing
- Purchase amount − payments/adjustments = outstanding payable
- Sale amount − receipts/adjustments = outstanding receivable
- Opening stock + purchases + returns in − sales − returns out ± adjustments = closing stock
- Invoice totals reconcile with transaction records
- Payment totals reconcile with payment allocations
- Financial reports reconcile with ledgers

Use decimal-safe monetary calculations.

Prevent double counting of payments, refunds, transfers, and adjustments.

Use database transactions for financial writes.

Avoid floating-point errors.

Ensure concurrent financial operations cannot corrupt balances.

Separate historical transaction dates from record creation and correction timestamps.

---

# 20. DATABASE, API & PERFORMANCE

Extend the existing architecture.

Do not create duplicate models where equivalent structures already exist.

Use appropriate indexes for:

- Transaction dates
- Mobile IDs
- Customer IDs
- Supplier IDs
- Invoice IDs
- Payment IDs
- Stock status
- Verification status
- Employee IDs

Optimize reporting queries.

Avoid N+1 queries.

Use server-side pagination for detailed records.

Use aggregation and caching only where it is safe and does not compromise financial correctness.

Ensure report generation works with large transaction histories.

Apply permissions on backend APIs, not only frontend screens.

Protect financial reports and sensitive customer information.

---

# 21. USER EXPERIENCE REQUIREMENTS

Keep the existing software's visual identity.

Build a professional, clean, responsive dashboard.

Suggested navigation:

**Shop Audit**
- Overview
- Financial Audit
- Cash & Bank
- Purchases & Sales
- Customers & Suppliers
- Give & Take
- Inventory Intelligence
- Product Analytics
- Expenses & Tax
- Invoice Audit
- Device Verification
- Security Audit
- Report Center

Avoid creating unnecessary separate pages if the existing navigation already provides suitable modules.

Use:

- KPI cards
- Interactive charts
- Searchable tables
- Advanced filters
- Drill-down panels
- Transaction timelines
- Status indicators
- Alerts
- Export actions

Use consistent currency formatting (PKR by default, configurable if needed).

Keep the interface understandable for a non-technical shopkeeper.

---

# 22. AUTOMATED TESTING

Create automated tests covering:

1. Daily, weekly, monthly, and custom-date reporting.
2. Opening and closing balances.
3. Payments received against earlier-period sales.
4. Historical inventory reconstruction.
5. Customer and supplier lifetime ledgers.
6. Partial purchase and sale payments.
7. Cash/bank transfers without double counting.
8. International currency conversions.
9. Purchase and sale returns.
10. Refunds and reversals.
11. Stock category counts.
12. PTA/JV/Non-PTA classifications.
13. Verification status and bypasses.
14. Slow-moving stock detection.
15. Product ranking calculations.
16. Profit/loss calculations.
17. Tax breakdowns.
18. Invoice consistency.
19. Employee audit events.
20. PDF and Excel export totals.
21. Permissions and unauthorized report access.
22. Financial reconciliation.
23. Backdated transactions.
24. Large reporting datasets.

All calculations must be tested against known business scenarios.

---

# 23. IMPLEMENTATION STRATEGY

Implement incrementally.

### Phase 1 — Existing Codebase Audit
Identify implemented features and gaps.

### Phase 2 — Financial Data Integrity
Fix inconsistent accounting relationships and reporting foundations.

### Phase 3 — Global Date Filters & Historical Balances
Implement correct period-based and as-of-date reporting.

### Phase 4 — Financial Audit
Profit/loss, cash, bank, payment channels, expenses, and taxes.

### Phase 5 — Customer & Supplier Intelligence
Lifetime history, rankings, ledgers, and balances.

### Phase 6 — Inventory Intelligence
Stock valuation, categories, verification, aging, and alerts.

### Phase 7 — Sales & Product Analytics
Top products, trends, margins, and comparisons.

### Phase 8 — Owner Security Audit
Employee activity, price integrity, and suspicious transaction monitoring.

### Phase 9 — Interactive Dashboard
Charts, KPI cards, filters, and drill-down navigation.

### Phase 10 — Report Center
Individual reports and complete shop audit exports.

### Phase 11 — Validation & Reconciliation
Automated tests, financial accuracy, and performance optimization.

---

# 24. FINAL NON-NEGOTIABLE REQUIREMENTS

1. This is an upgrade to an existing working application.
2. Preserve existing functionality and historical data.
3. Reuse current architecture, models, services, APIs, and UI components wherever practical.
4. Do not implement fake dashboards using static numbers.
5. Every KPI must be calculated from real business data.
6. Every important number must have a drill-down explanation.
7. Every mobile must remain traceable to its purchase, sale, payments, and invoices.
8. Every customer and supplier must have a complete transaction journey.
9. Historical reports must reflect the selected historical period.
10. Separate cash flow from revenue and profit.
11. Separate money payable from money receivable.
12. Separate stock cost from expected selling value.
13. Maintain immutable financial and security audit trails.
14. Provide comprehensive PDF and Excel reports.
15. Keep reports consistent across the entire application.
16. Respect role-based permissions.
17. Avoid destructive migrations.
18. Do not silently invent missing data.
19. Verify functionality through automated tests.
20. Do not claim completion until the implementation is integrated and validated.

## STARTING INSTRUCTION

**First, inspect my entire existing codebase.**

Then provide:

1. Current architecture summary.
2. Existing functionality inventory.
3. Missing functionality and gaps.
4. Database changes required.
5. API and service changes required.
6. UI components to reuse or extend.
7. Accounting and reporting risks.
8. A phased implementation plan.
9. Estimated complexity and dependencies.
10. Testing and migration strategy.

After the audit, proceed incrementally with safe, testable changes.

Ask for approval before destructive or irreversible changes.

**The final goal is a complete, trustworthy Shop Audit System where the owner can inspect every rupee, every mobile, every customer, every supplier, every employee action, and every business result for any selected period.**
