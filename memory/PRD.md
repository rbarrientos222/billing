# Billing System - Product Requirements Document

## Original Problem Statement
Build a billing system with the following features:

### A. Backend for Admin
1. Login - Admin login page
2. Dashboard - Gross sales, expenses, net sales, monthly sales graph, receivables, active subscribers, open tickets, Mikrotik stats
3. User Management - Create/manage user accounts with roles (cashier, tech, admin, user, billing)
4. Settings - Discounts/rebates, Subscription Plans, import/export
5. Mikrotik Management (v6 & v7) - Integration/configuration
6. Mikrotik Accounts - Integrated with subscriber registration (PPPoE username, password, profile)
7. Subscriber Registration - Auto-generated account number, PPPoE account, billing period, installation details
8. Company Setup - Logo, business name, address for receipts/SOA
9. Inventory - Stock management, MAC/serial tracking
10. Expenses - Category-based, included in dashboard net sales
11. Import/Export - Subscribers
12. Billing Module - SOA PDF, Billing Cycle automation, Automatic SMS

### B. Cashier Module
- Login, dashboard, fast search, receipt printing, OR/SI numbering, advance payment logic

### C. Technician Module
- Login, dashboard (job order stats), fulfill job orders with material entry

### D. Subscriber Portal
- Login (account number), dashboard (job orders, payment records, chat, account history)

---

## What's Been Implemented

### Completed Features (as of Feb 8, 2026)

#### Backend (FastAPI)
- [x] JWT Authentication with role-based access
- [x] User Management (admin, cashier, tech, billing roles)
- [x] Subscription Plans CRUD with Edit/Delete
- [x] User password change functionality
- [x] Subscriber Management with Philippine address structure
- [x] PPPoE Account fields integrated in subscriber form
- [x] Prorated billing using installation date
- [x] Custom billing day (1-31) per subscriber
- [x] **Automatic Billing Scheduler (APScheduler)**
  - Runs daily at 00:01 AM
  - Generates invoices for subscribers on their billing day
  - Billing status API
  - Manual billing trigger
  - Billing logs history
  - Upcoming billing preview
- [x] **Centralized Payment System**
  - `/api/payments/centralized` endpoint
  - FIFO allocation to oldest invoices first
  - Partial payment support (invoice status: 'partial')
  - Overpayment handling (excess → wallet credit)
  - Wallet balance tracking per subscriber
- [x] Payment processing with OR number generation
- [x] Payment history per subscriber with descriptions
- [x] Invoice management with remaining_balance calculation
- [x] Dashboard statistics API (fixed to handle both legacy and centralized payments)
- [x] Monthly Sales Trend API (12 months data)
- [x] Mikrotik integration structure (awaiting credentials)
- [x] **Inventory Management System** (NEW - Feb 5, 2026)
  - Full CRUD for inventory items
  - Track by quantity (standard items)
  - Track by length (cables, wires - bulk mode)
  - **Unit tracking by MAC/Serial number** (serialized items)
  - Stock adjustment with reason logging
  - Low stock alerts and restock levels
  - Inventory statistics API
  - Adjustment history per item
- [x] **Inventory Unit Tracking** (NEW - Feb 5, 2026)
  - Add individual units with MAC address and/or serial number
  - Track unit status: available, assigned, defective, returned
  - Assign units to subscribers
  - Return units (back to available or mark defective)
  - Prevent duplicate MAC addresses/serial numbers
  - Auto-increment parent inventory quantity on unit add
- [x] **Equipment Assignment on Subscriber Registration** (NEW - Feb 5, 2026)
  - Search inventory units by MAC address during registration
  - Auto-assign selected equipment to subscriber on creation
  - Get subscriber equipment endpoint
  - Equipment tracking linked to subscriber account
- [x] **Purchasing Module** (NEW - Feb 5, 2026)
  - Supplier management (name, contact, phone, email, address)
  - Create purchase orders with PO number, invoice number
  - Purchase date and delivery date tracking
  - Add new inventory items during purchase (auto-create)
  - Restock existing inventory items
  - Track items by category, quantity, unit, cost
  - Option for serialized items (MAC/Serial) and bulk items (length)
  - Auto-create expense entry when purchase is created
  - Payment tracking (unpaid, partial, paid)
  - Add partial payments with payment mode (cash, bank, check, GCash)
  - Purchase statistics (total spent, monthly, unpaid amount)

#### Frontend (React)
- [x] Login page with role-based routing (no default credentials)
- [x] Admin Dashboard with:
  - Sales metrics with live data
  - **Monthly Sales Trend Chart** (12-month graph)
  - **Billing Calendar View** (dynamic - shows all custom billing days)
  - Billing Quick Actions panel
- [x] Subscriber Management with:
  - Cascading address dropdowns (Province > Municipality > Barangay)
  - PPPoE configuration fields with activation status (Pending/Active)
  - Auto-generated PPPoE username (firstnamelastname format)
  - **Auto-capitalization** for name fields
  - **Installation Date** field with prorated calculation
  - **Custom Billing Day** selection (1-31)
  - **Wallet Balance** display in subscriber list
  - **Table Pagination** (10/20/50/100 per page) - NEW Feb 2026
  - **Tabbed View Records dialog** (Invoices, Payments, Equipment tabs) - NEW Feb 2026
  - **Prorated Billing Option** with real-time preview
  - **Change Plan** with prorated adjustment billing
  - **Deactivate Subscriber** with final bill calculation
  - **Reactivate Subscriber** with prorated billing
  - **Delete Subscriber** with admin password confirmation
  - **Add Manual Charges** (equipment, service fees, etc.)
- [x] **Expense Management** (NEW - Feb 9, 2026)
  - Stats cards: Total Expenses, This Month, Recurring count/amount, Categories count
  - Expense table with Date, Category, Description, Reference, Amount, Type, Actions
  - Filters: Search, Category dropdown, Recurring (All/Yes/No), Date range
  - Add/Edit/Delete expenses with Category, Description, Amount, Date, Reference
  - **Recurring flag** with type (daily/weekly/monthly) - for manual tracking
  - **Expense Categories**: 8 preset categories + custom categories
  - Preset: Utilities, Salaries, Supplies, Maintenance, Fuel, Internet, Rent, Purchase
  - Custom categories can be added/deleted; preset categories protected
  - **Purchase integration**: Auto-creates expense when purchase is made
  - Purchase-linked expenses marked "Auto-created" and protected from edit/delete
  - Dashboard integration: Expenses reflected in Net Sales calculation
  - Access: Admin + Billing role
  - **Reports & Analytics Tab** (NEW - Feb 9, 2026)
    - Month comparison cards: This Month, Last Month, Change (+/-), Avg Daily Expense
    - Monthly expense trend area chart (12 months)
    - Category breakdown pie chart with percentages
    - Expense breakdown bar charts (By Type: Recurring vs One-time, By Source: Manual vs Purchases)
    - Top 5 expenses table

- [x] **Cashier Dashboard**
  - Universal search (by account number, name, or phone)
  - **Centralized Payment Form** with FIFO allocation
  - Invoice list with status badges (Unpaid, Partial, Paid)
  - Payment history with descriptions
  - Today's Collections (live updated)
  - Wallet Balance display
  - **Payment History Enhancements** (NEW - Feb 9, 2026)
    - Hidden by default with "Show History (X)" toggle button
    - Date range filter (From Date, To Date) with Apply/Clear
    - API supports `?start_date=X&end_date=Y` query params
  - **Advance Payment to Wallet** (NEW - Feb 9, 2026)
    - "Add Advance Payment to Wallet" button when no outstanding invoices
    - Amount input with Payment Mode selection (Cash, GCash, Bank, Card)
    - Creates payment record with `is_advance_payment: true`
    - Wallet balance updates immediately
    - `/api/subscribers/{account_number}/wallet` POST endpoint
  - **Receipt Printing** (NEW - Feb 23, 2026)
    - Connect Bluetooth Printer button (Web Bluetooth API for mobile thermal printers)
    - Auto-print receipt after payment checkbox
    - Print Last Receipt button
    - Print button for each payment in history table
    - Supports 48mm and 58mm thermal paper formats
    - Browser print fallback when Bluetooth not available
- [x] **Subscription Plans Management**
  - Full CRUD (Create, Edit, Delete)
- [x] **User Management**
  - Full CRUD with Change Password functionality
- [x] **Inventory Management** (NEW - Feb 5, 2026)
  - Stats cards (Total Items, Total Value, Low Stock, Categories)
  - Low stock alerts with restock badge
  - Item list with search and category filter
  - **Table Pagination** (10/20/50/100 per page) - NEW Feb 2026
  - Add/Edit/Delete inventory items
  - Track standard items, bulk items (length), and serialized items
  - **Manage Units dialog** for serialized items
    - List units with MAC address, serial number, status
    - Assign/Available/Defective status badges
    - Add new units with MAC/Serial
    - Delete available units
- [x] **Equipment Assignment Integration** (NEW - Feb 5, 2026)
  - MAC address search field in subscriber registration form
  - Search dropdown showing available inventory units
  - Auto-populate MAC on selection with item details
  - Selected equipment info card with "Remove" option
  - **Assigned Equipment** section in View Records dialog
  - Equipment display with MAC, Serial, Item name, status badge, date
- [x] **Purchasing Module UI** (NEW - Feb 5, 2026)
  - Stats cards (Total Spent, This Month, Unpaid, Suppliers)
  - Purchase orders list with search and status filter
  - **Table Pagination** (10/20/50/100 per page) - NEW Feb 2026
  - Status badges (Unpaid red, Partial amber, Paid green)
  - Add Supplier dialog (name, contact, phone, email, address)
  - New Purchase dialog with:
    - Supplier selection or manual entry
    - PO number, invoice number, dates
    - Add multiple items (new or existing inventory)
    - Item options: category, quantity, unit, cost
    - New item options: MAC/Serial tracking, length tracking
    - Real-time total calculation
  - View Purchase dialog with item details and payment summary
  - Add Payment dialog with amount, mode, reference

- [x] **UI/UX Improvements** (NEW - Feb 2026)
  - Reusable TablePagination component with page size selector (10/20/50/100)
  - First/Prev/Next/Last navigation buttons
  - Current page and total pages indicator ("Page X of Y")
  - Total items display ("Showing X-Y of Z")
  - Reset to page 1 on search/filter changes

- [x] **Admin Sidebar Reorganization** (NEW - Feb 2026)
  - Job Orders menu item between Subscribers and Mikrotik
  - Settings with expandable sub-menu containing:
    - Users
    - Plans
    - Rebates (placeholder)
    - Printer Setup (placeholder)
    - SOA Setup (placeholder)
    - Company

- [x] **Job Order Management** (NEW - Feb 8, 2026)
  - Full CRUD for job orders
  - Job types: Installation, Repair/Troubleshooting, Relocation, Disconnection, Reactivation, Equipment Replacement, **Replace Modem**, **Pull Out Modem**, Others
  - Priority levels: Critical, High, Medium, Low
  - SLA tracking with configurable target hours (Critical: 2h, High: 8h, Medium: 12h, Low: 24h)
  - SLA breach detection and display
  - Multiple technician assignment
  - Scheduling with date and time slots
  - Stats dashboard (Open, In Progress, On Hold, Completed, Cancelled, SLA Breached, Avg Time)
  - **Subscriber autocomplete search** (type to search by name/account number)
  - **Relocation job type** - Captures new address, updates subscriber address on completion
  - **Pull Out Modem** - Returns equipment to inventory as available
  - **Replace Modem** - Marks old equipment as defective, assigns new equipment
  - Completion remarks/notes for technicians

- [x] **Technician Module** (NEW - Feb 2026)
  - Technician login and role-based access
  - Technician dashboard with personal job order stats
  - My Job Orders page with assigned jobs only
  - Job workflow: Start → In Progress → Complete
  - Put on Hold / Resume functionality
  - Material entry from inventory:
    - Select items from inventory
    - Select specific units for serialized items (MAC/Serial)
    - Set quantity for non-serialized items
    - Materials deducted from inventory automatically
    - Materials added to subscriber equipment records
  - Time tracking (started_at, completed_at, time_rendered_minutes)
  - **Equipment selection for Pull Out / Replace Modem jobs**

- [x] **Inventory Improvements** (Feb 8, 2026)
  - **"Available / Total" display** for serialized items (e.g., "1 / 5 pcs")
  - Clear distinction between available and assigned units
  - Low stock alerts show available count for serialized items
  - **Equipment & Materials tab** in subscriber records (shows both equipment and materials used from job orders)

---

## Pending Issues

| Priority | Issue | Status |
|----------|-------|--------|
| P2 | PPPoE Profile dropdown is static (not fetching from Mikrotik) | Not Started |
| P2 | Address data for municipalities and barangays is incomplete sample data | Not Started |
| P3 | Babel plugin disabled in dev environment as workaround | Technical Debt |

---

## Upcoming Tasks (P0-P1)

1. **Subscriber Portal** - Login (account number) and dashboard for subscribers
2. **Billing PDF/SOA Generation** - Generate PDF statements
3. **Mikrotik Management Page** - UI for admin to configure Mikrotik credentials

---

## Future/Backlog Tasks

- Admin Settings (discounts/rebates configuration, import/export)
- Company Setup page
- Wallet Management UI (admin manual add/deduct credits)
- Receipt printing
- OR/SI numbering logic
- Auto-email SOA
- Automatic SMS triggers for billing events
- Complete Philippine address data (municipalities/barangays)
- Backend code refactoring (server.py is 4000+ lines - needs modularization)
- Printer Setup configuration
- SOA Template configuration

---

## Technical Stack

- **Backend:** FastAPI, Pydantic, MongoDB (motor), APScheduler
- **Frontend:** React, React Router, Axios, TailwindCSS, Shadcn/UI, Recharts
- **Integrations:** routeros-api (Mikrotik), ReportLab (PDF)

---

## Test Credentials

- **Admin:** admin / @Gello1006
- **Cashier:** cashier1 / test123

---

## Known Limitations

1. **Mikrotik Integration:** MOCKED - returns errors until credentials are configured
2. **Address Data:** Municipality and Barangay data is sample data (not complete)
3. **SMS/Email:** Not yet implemented
4. **Backend Code Size:** server.py is 3000+ lines and needs modularization
5. **Visual Edits Plugin:** Temporarily disabled in dev mode due to babel stack overflow with large components

---

## Test Reports

- `/app/test_reports/iteration_2.json` - Centralized payment testing
- `/app/test_reports/iteration_3.json` - Inventory unit tracking testing (100% pass rate)
- `/app/test_reports/iteration_4.json` - MAC search & equipment assignment testing (100% pass rate)
- `/app/test_reports/iteration_5.json` - Purchasing module testing (100% pass rate)
- `/app/test_reports/iteration_6.json` - UI/UX refactor testing
- `/app/test_reports/iteration_7.json` - Job Order & Technician module testing
- `/app/test_reports/iteration_8.json` - Cashier module enhancements (100% pass rate)
- `/app/test_reports/iteration_9.json` - Expense module testing (100% pass rate)
