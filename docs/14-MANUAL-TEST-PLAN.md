# 14 — Manual test plan (owner walkthrough)

Run on the phone (`http://<PC-IP>:5173`, see CLAUDE.md) or laptop browser (`http://localhost:5173`).
Use a **new test shop** (sign up with any unused number, e.g. 03990000123) so real data stays clean.
For every step note: ✅ OK / ❌ problem + screenshot. Check both **Urdu** and **English** at least once (More → زبان).

## A. Start
1. Sign up a new shop (Urdu shop name too). Home opens in Urdu.
2. Tap the today's-sales card: amounts show / hide.
3. More → فوری پن: set a PIN. Logout → log in with PIN. Logout → "پن بھول گئے" → password.
4. More → دکان کی سیٹنگز: shop phone, city, receipt footer. Save.

## B. Customers and suppliers (کھاتے)
5. Add a customer (name, phone, CNIC). Add a supplier. Add another shop (دوسری دکان).
6. Search by name, by phone, by CNIC.
7. Open the customer: balance "صاف", edit details, save.

## C. Stock in
8. Old stock: خریداری → "پرانا اسٹاک" → add 2 phones (one PTA, one Non-PTA with SIM time). Save.
9. Supplier purchase: خریداری → سپلائر → 2 box-pack phones with accessories (box, charger), pay part now.
10. Walk-in used phone: خریداری → گاہک → used phone → save → "ابھی تصدیق کریں":
    CNIC number, 3 photos with the phone camera, eGadget "صاف", declaration ticked, print declaration.
11. Stock tab: brand row, filters, sort, cards. Open a device → history shows each step.
12. IMEI check (scan icon): type an IMEI already bought → "پہلے آ چکا ہے"; a new one → "نیا".

## D. Sell
13. فروخت → customer → pick a phone → price, warranty, give box, charger pending with a date → pay part.
14. Print receipt (80 mm) and A4 — text in the shop language, IMEI shown, remaining balance shown.
15. Try selling a used phone that is NOT verified → blocked; owner override reason → allowed.
16. Cash sale (no customer) must be paid in full.

## E. Money
17. Customer → رقم وصول کریں (Easypaisa) → balance goes down; statement shows running balance.
18. Supplier → رقم ادا کریں → payable goes down.
19. Excel: download stock, a customer's statement, reports sales — open in Excel, Urdu names readable.

## F. Used-phone special cases
20. Amanat: device → امانت پر دیں to the other shop → More → امانت → "انہوں نے رکھ لیا" at 1,000 with 500 paid.
21. Return: open that sale → اشیاء واپس → "آمدنی رکھیں" → device back in stock, shop balance clear.
22. Exchange: More → ایکسچینج → old phone in, new phone out → new balance shown → receipt.

## G. Repair lab, accessories, expenses
23. New repair for a customer (faults, received SIM/cover, estimate, advance) → job sheet prints.
24. Repair → حالت بدلیں → تیار → parts (from accessory stock) + labour → حوالے کریں with payment.
25. Accessories: add chargers with opening qty; sell one via sale "other items"; low-stock tab.
26. Pending accessories tab: the charger promised in step 13 appears → "دے دیا".
27. Expenses: add tea and rent. Day close: count the cash drawer → difference shown.

## H. Staff and reports
28. More → عملہ: add a salesman. Log in as salesman: no cost/profit, no expenses/reports, cannot cancel sales.
29. Reports: profit & loss for this month, cash flow, stock age. Print / PDF.
30. Notifications settings: switch on "sale → customer WhatsApp", make a sale → More → پیغامات → open WhatsApp link.

## I. Look and feel
31. Light / dark theme. Urdu text never cut off, buttons easy to tap, nothing hidden behind the bottom bar.
32. Laptop browser: everything works (layout is still phone-width — desktop layout is a pending decision).

## Known gaps (don't report these)
- No opening-balance button for customers in the UI yet (API exists).
- WhatsApp sends via share link, not automatically.
- Desktop layout, offline installer, Android APK not built yet.
