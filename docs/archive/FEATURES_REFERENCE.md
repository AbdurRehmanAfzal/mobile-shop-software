# View Customer & View Supplier - Features Reference Guide

## Quick Access

### URLs
- **View Customer:** http://localhost:5173/view-customer
- **View Supplier:** http://localhost:5173/view-supplier
- **Dashboard:** http://localhost:5173/ (with quick action buttons)

---

## ViewCustomer Features

### 1. Search Box
**What it does:**
- Real-time search as you type
- Searches by customer name OR phone number
- Case-insensitive matching

**How to use:**
1. Type in "Search by name or phone" box
2. Results filter instantly
3. Clear box to reset search

### 2. Advanced Filters Section

#### City Filter
- Dropdown list of all cities
- Select one city to filter
- Shows customers from that city only

#### Status Filter
- **Active:** Show only active customers
- **Inactive:** Show only inactive customers
- **All:** Show both active and inactive

#### Credit Balance Range
- **Min Credit:** Minimum balance to show
- **Max Credit:** Maximum balance to show
- Example: Min 0, Max 10000 shows customers with balance 0-10000

#### Reset Button
- Clears all filters
- Clears search box
- Returns to full customer list

### 3. Statistics Cards (Top)
Shows at a glance:
- **Total Customers:** How many customers total
- **Total Credit:** Sum of all customer credit balances
- **Filtered Results:** How many results match current search/filter

### 4. Column Customization
**Available Columns (Toggle on/off):**
1. ID
2. Name
3. Phone
4. Email
5. City
6. Address
7. Credit Balance
8. Total Purchased
9. Total Paid
10. Is Active (Status)
11. Created At
12. Updated At

**How to customize:**
1. Click "Customize Columns" button
2. Toggle any column on/off
3. Table updates instantly
4. Click "Reset Columns" to restore defaults

### 5. Customer Table
**Features:**
- Shows all selected columns
- Responsive (hides columns on mobile if needed)
- Color-coded status badges:
  - 🟢 Green = Active customer
  - 🔴 Red = Inactive customer
- Color-coded balance:
  - 🔴 Red = Customer owes money (credit)
  - 🟢 Green = Advance payment (refund)

### 6. Detail Modal
Click any customer row to open modal showing:

**Contact Information:**
- Name
- Phone
- Email
- WhatsApp number (if available)

**Address:**
- Full address
- City
- CNIC (if available)

**Account Information:**
- Status (Active/Inactive badge)
- Account created date
- Last updated date

**Financial Summary:**
- Current Balance (color-coded)
  - Red if customer owes
  - Green if customer has advance
- Total Purchased (how much they bought)
- Total Paid (how much they paid)

**Notes:**
- Any additional notes about customer

---

## ViewSupplier Features

### 1. Search Box
**What it does:**
- Real-time search as you type
- Searches by supplier name OR phone number
- Case-insensitive matching

### 2. Advanced Filters Section

#### City Filter
- Dropdown list of all cities
- Select one city to filter
- Shows suppliers from that city only

#### Status Filter
- **Active:** Show only active suppliers
- **Inactive:** Show only inactive suppliers
- **All:** Show both active and inactive

#### Amount Due Range
- **Min Due:** Minimum amount due to show
- **Max Due:** Maximum amount due to show
- Example: Min 0, Max 50000 shows suppliers you owe 0-50000

#### Reset Button
- Clears all filters
- Clears search box
- Returns to full supplier list

### 3. Statistics Cards (Top)
Shows at a glance:
- **Total Suppliers:** How many suppliers total
- **Total Due:** Sum of all supplier amounts due
- **Filtered Results:** How many results match current search/filter

### 4. Column Customization
**Available Columns (Toggle on/off):**
1. ID
2. Name
3. Phone
4. Email
5. City
6. Address
7. Contact Person
8. Amount Due (Owed to supplier)
9. Total Supplied
10. Total Paid
11. Is Active (Status)
12. Created At
13. Updated At

**How to customize:**
1. Click "Customize Columns" button
2. Toggle any column on/off
3. Table updates instantly
4. Click "Reset Columns" to restore defaults

### 5. Supplier Table
**Features:**
- Shows all selected columns
- Responsive (hides columns on mobile if needed)
- Color-coded status badges:
  - 🟢 Green = Active supplier
  - 🔴 Red = Inactive supplier
- Color-coded balance:
  - 🔴 Red = You owe supplier money
  - 🟢 Green = Supplier overpaid/advance

### 6. Detail Modal
Click any supplier row to open modal showing:

**Contact Information:**
- Name
- Phone
- Email
- WhatsApp number (if available)

**Address & Contact:**
- Full address
- City
- Contact Person (if recorded)
- CNIC (if available)

**Account Information:**
- Status (Active/Inactive badge)
- Account created date
- Last updated date

**Financial Summary:**
- Current Balance (color-coded)
  - Red if you owe supplier
  - Green if supplier owes you
- Total Supplied (how much they supplied)
- Total Paid (how much you paid them)

**Notes:**
- Any additional notes about supplier

---

## Common Tasks

### Search for a Customer
1. Go to View Customer page
2. Type name or phone in search box
3. Results filter instantly
4. Click a row to see details

### Find Customers in a City
1. Go to View Customer page
2. Select city from "City" dropdown
3. Table shows only that city
4. Can combine with status or balance filter

### Check How Much a Customer Owes
1. Go to View Customer page
2. Click on customer row
3. Modal opens showing balance
4. Red number = customer owes you
5. Green number = customer has advance

### Find All Inactive Suppliers
1. Go to View Supplier page
2. Change "Status" to "Inactive"
3. Table shows only inactive suppliers
4. Click to view details

### Check Payment Status with Supplier
1. Go to View Supplier page
2. Click on supplier row
3. Modal shows:
   - Amount Due (red = you owe)
   - Total Supplied
   - Total Paid
4. Calculate balance: Total Supplied - Total Paid

### Customize Table View
1. Click "Customize Columns" button
2. Toggle columns you want to see
3. Uncheck columns you don't want
4. Close modal
5. Table updates with selected columns
6. Use "Reset Columns" to go back to default

---

## Filtering Examples

### Find Active Customers from Karachi with < 5000 Credit
1. Search box: (leave empty)
2. City: Karachi
3. Status: Active
4. Credit Balance Range: Min 0, Max 5000
5. View matching customers

### Find Suppliers You Owe More Than 100,000
1. Search box: (leave empty)
2. City: (leave empty - all cities)
3. Status: All
4. Amount Due Range: Min 100000, Max 999999
5. View suppliers you owe

### Search for Customer "Ahmed"
1. Search box: Type "Ahmed"
2. Leave all filters empty
3. Shows all customers with "Ahmed" in name
4. Clear search to reset

---

## Bilingual Support

### Switch Language
1. Click language button in top right (اردو / English)
2. All labels switch to other language
3. RTL layout activates for Urdu
4. Table data remains in original language

### Urdu Interface Shows:
- جدول (Table)
- ڈھونڈیں (Search)
- فلٹر کریں (Filter)
- تفصیلات (Details)
- فعال (Active)
- غیر فعال (Inactive)

---

## Keyboard Shortcuts

| Action | How |
|--------|-----|
| Open Detail Modal | Click customer/supplier row |
| Close Detail Modal | Click X or click outside modal |
| Clear Search | Clear search box text |
| Reset Filters | Click "Reset Filters" button |
| Toggle Column | Click checkbox in column selector |

---

## Responsive Design

### Desktop (1200px+)
- Full table with all columns visible
- All columns readable
- Modal popup

### Tablet (768px - 1199px)
- Responsive grid
- Some columns hidden by default
- Use column customization to show/hide

### Mobile (<768px)
- Single column view
- Horizontally scrollable
- Optimized for touch
- Full modal view

---

## Troubleshooting

### Search Not Working
- Clear search box and retype
- Check spelling
- Search works for name AND phone

### No Results Showing
- Check if filters are too restrictive
- Click "Reset Filters"
- Verify data exists in database

### Modal Not Opening
- Check if row is clickable (should highlight)
- Try clicking again
- Refresh page if needed

### Language Not Switching
- Click language button in top right
- Wait for page to refresh
- Check browser console for errors

### Columns Not Showing
- Click "Customize Columns"
- Toggle column on
- Apply changes

---

## Tips & Tricks

### Combine Search with Filters
- Use search to find specific person
- Use filters for range/status queries
- Both work together

### Export Data Manually
- Customize columns you want
- Take screenshot or copy-paste table
- Use browser "Print to PDF" for formatted output

### Track Balance Changes
- Open customer detail modal
- Note current balance
- Add payment
- Return to modal to see updated balance

### Identify Problems Quickly
- Red balance means customer owes you
- Red status means inactive account
- High credit balance means customer owes lots

---

## Keyboard Navigation

All buttons and inputs are keyboard accessible:
- Tab: Move between elements
- Enter: Click button or open modal
- Escape: Close modal
- Space: Toggle checkbox

---

This guide covers all features available in View Customer and View Supplier modules. For more technical details, see CUSTOMER_SUPPLIER_MODULES.md.
