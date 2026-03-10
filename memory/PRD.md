# Billing System - Product Requirements Document

## Last Updated: March 10, 2026

### Latest Feature (March 10, 2026) - Invoice Adjustment
- **ADDED:** Invoice Amount Adjustment with Audit Trail
  - New "Adjust" button (pencil icon) in Invoices tab for unpaid invoices
  - Adjustment dialog with:
    - Current invoice details display
    - New amount input
    - Required remark/reason field
  - Backend endpoint: `PUT /api/invoices/{invoice_number}/adjust`
  - Audit logging:
    - Logged in `audit_logs` collection with full change details
    - Dedicated `invoice_adjustments` collection for easy querying
  - Security: Only admin role can adjust invoices
  - Restriction: Cannot adjust already paid invoices
  - Files modified:
    - `/app/frontend/src/components/admin/SubscriberManagement.js`
    - `/app/backend/server.py`

### Previous Feature (March 10, 2026) - Multi-Mikrotik Improvements
- **ADDED:** PPPoE Profile Management in Settings
  - New UI component: `/app/frontend/src/components/admin/PPPoEProfileManagement.js`
  - New backend endpoints:
    - `GET /api/pppoe-profiles` - List all profiles
    - `GET /api/pppoe-profiles/active` - List active profile names
    - `POST /api/pppoe-profiles` - Create new profile
    - `PUT /api/pppoe-profiles/{name}` - Update profile
    - `DELETE /api/pppoe-profiles/{name}` - Delete profile (prevented if subscribers using it)
  - Fields: name, rate_limit, description, is_active
  - Profiles stored in database (`pppoe_profiles` collection) instead of fetching from Mikrotik
  - Shows subscriber count per profile

- **UPDATED:** Subscriber Registration now uses database profiles
  - Modified `fetchProfiles()` in SubscriberManagement.js
  - Now calls `/api/pppoe-profiles/active` instead of `/api/mikrotik/profiles`
  - Profiles are consistent across all Mikrotik routers

- **UPDATED:** Dashboard Mikrotik Stats (Option C - Summary + Breakdown)
  - Aggregated view showing total active clients across ALL routers
  - Shows online/offline router count
  - Per-router breakdown with individual client counts
  - Handles graceful failure for unreachable routers

- **ADDED:** Subscriber count endpoint
  - `GET /api/subscribers/count?pppoe_profile={name}` - Get subscriber count by profile

### Production Deployment Fix (March 10, 2026)
- **FIXED:** Frontend not serving production build
  - Changed `yarn start` to use `serve -s build` for production
  - Added `start:dev` script for development (`craco start`)
  - Installed `serve` package

- **FIXED:** Login failing on production (apl-billing.net)
  - Issue: API URL was hardcoded at build time using REACT_APP_BACKEND_URL
  - Solution: Updated all components to use dynamic URL detection:
    ```javascript
    const API = process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : process.env.REACT_APP_BACKEND_URL;
    ```
  - Files updated: App.js, ImportExport.js, PaymongoSettings.js, Reports.js, 
    AccountInfo.js, ActiveBill.js, SubscriberLogin.js, SubscriberPortal.js

### Previous Bug Fix (March 7, 2026)
- **FIXED:** Receipt printing - footer text not appearing
  - Root cause: `/api/receipt/data/{or_number}` endpoint was not merging `company_settings` data
  - The endpoint fetched from `receipt_settings` but `receipt_footer` was stored in `company_settings`
  - Solution: Added company_settings merge logic (same as `/settings/receipt` endpoint)
  - File modified: `/app/backend/server.py` (get_receipt_data function, lines 6140-6195)
  - Result: Custom footer from Company Settings now appears on printed receipts

- **FIXED:** Receipt printing - long text cut off mid-word
  - Root cause: CSS `word-wrap: break-word` alone insufficient for narrow thermal receipt widths
  - Solution: Enhanced CSS with `overflow-wrap: anywhere` and `word-break: break-word`
  - Added `max-width` constraint to body and `flex-wrap: wrap` to row elements
  - File modified: `/app/frontend/src/pages/CashierDashboard.js` (generateReceiptHTML function)
  - Result: Long text (addresses, descriptions, footer) now wraps properly without mid-word cuts

### Previous Bug Fix (March 4, 2026)
- **FIXED:** Expenses module crash on mobile - `handleFilter is not defined`
  - Root cause: Function called `handleFilter` but defined as `handleApplyFilters`
  - Solution: Changed `onClick={handleFilter}` to `onClick={handleApplyFilters}` on line 445
  - File modified: `/app/frontend/src/components/admin/ExpenseManagement.js`
  - Result: Expenses page now loads and functions correctly on mobile devices

- **ADDED:** Pagination for Expenses module
  - Shows 20 items per page by default (configurable: 10, 20, 50, 100)
  - Display format: "Show [X] per page | 1-20 of 324"
  - Navigation: First, Previous, Next, Last page buttons
  - Auto-resets to page 1 when filters change
  - Works on both mobile and desktop views

- **FIXED:** Subscriber Management "View Records" button error - `openHistoryDialog is not defined`
  - Root cause: Function called `openHistoryDialog` but defined as `handleViewHistory`
  - Solution: Replaced all occurrences of `openHistoryDialog` with `handleViewHistory`
  - File modified: `/app/frontend/src/components/admin/SubscriberManagement.js`
  - Result: "View Records" button now opens subscriber history dialog correctly

- **ENHANCED:** Manual charges now auto-apply wallet credits
  - Previously: Manual charges created invoices without checking wallet balance
  - Now: When adding a manual charge, system automatically:
    1. Checks subscriber's wallet balance
    2. Applies available credits to the charge
    3. Updates invoice as fully paid (if wallet covers amount) or partially paid
    4. Deducts from subscriber wallet
    5. Logs wallet transaction
    6. Returns detailed response with wallet_applied, remaining_balance, new_wallet_balance
  - File modified: `/app/backend/server.py` (add_manual_charge endpoint)
  - Tested scenarios:
    - ₱300 charge with ₱500 wallet → ₱300 applied, invoice fully paid
    - ₱1000 charge with ₱200 wallet → ₱200 applied, ₱800 remaining balance

- **FIXED:** User password update not working
  - Root cause: `change_user_password` endpoint was storing to wrong field (`hashed_password` instead of `password`)
  - Login endpoint checks `password` field, but password update was writing to `hashed_password`
  - Solution: Changed `{"$set": {"hashed_password": ...}}` to `{"$set": {"password": ...}}`
  - File modified: `/app/backend/server.py` (PUT /users/{username}/password endpoint)
  - Tested: Password change and login with new password now works correctly

- **FEATURE:** Multiple Mikrotik Router Management
  - New collection `mikrotik_routers` for storing multiple router configs
  - Backend endpoints:
    - `GET /api/mikrotik/routers` - List all routers
    - `POST /api/mikrotik/routers` - Add new router
    - `PUT /api/mikrotik/routers/{router_id}` - Update router
    - `DELETE /api/mikrotik/routers/{router_id}` - Delete router
    - `POST /api/mikrotik/routers/{router_id}/test` - Test connection
    - `GET /api/mikrotik/routers/{router_id}/stats` - Get router stats
    - `GET /api/mikrotik/all-profiles` - Get profiles from all routers
  - Frontend redesigned with mobile-friendly card-based layout
  - Stats cards: Total Routers, Online, Offline, Active Clients
  - Router list with status badges, connection test, edit/delete actions
  - Updated Subscriber model to support `mikrotik_ids` for per-subscriber router assignment (future use)
  - Files modified: `/app/backend/server.py`, `/app/frontend/src/components/admin/MikrotikManagement.js`

- **FEATURE:** Mikrotik Selection in Subscriber Registration
  - Added multi-select Mikrotik router selection in subscriber registration form
  - "Select All" and "Clear" buttons for quick selection
  - By default, all active routers are selected
  - When creating subscriber with PPPoE activation:
    - Creates PPPoE account on all selected Mikrotik routers
    - If no routers selected, creates on ALL active routers
    - Returns detailed results per router (success/failure)
    - Stores `pppoe_status` per router in subscriber record
  - Mobile-friendly card-based UI for router selection
  - Files modified: `/app/frontend/src/components/admin/SubscriberManagement.js`, `/app/backend/server.py`

### Previous Bug Fix (Feb 28, 2026)
- **FIXED:** Cashier Receivables `TypeError: '<' not supported between 'datetime' and 'str'`
  - Root cause: Mixed date types (datetime objects and strings) in invoice `due_date` field
  - Solution: Added `safe_parse_date()` helper function to normalize all dates before comparison
  - File modified: `/app/backend/server.py`
  - Endpoint fixed: `GET /api/cashier/receivables`

## Original Problem Statement
Build a billing system with the following features:

### A. Backend for Admin
1. Login - Admin login page
2. Dashboard - Gross sales, expenses, net sales, monthly sales graph, receivables, active subscribers, open tickets, Mikrotik stats, **Total Discounts**
3. User Management - Create/manage user accounts with roles (cashier, tech, admin, user, billing)
4. Settings - **Discounts/Rebates (IMPLEMENTED)**, Subscription Plans, import/export
5. Mikrotik Management (v6 & v7) - Integration/configuration
6. Mikrotik Accounts - Integrated with subscriber registration (PPPoE username, password, profile)
7. Subscriber Registration - Auto-generated account number, PPPoE account, billing period, installation details
8. Company Setup - Logo, business name, address for receipts/SOA
9. Inventory - Stock management, MAC/serial tracking
10. Expenses - Category-based, included in dashboard net sales
11. Import/Export - Subscribers
12. Billing Module - SOA PDF, Billing Cycle automation, Automatic SMS

### B. Cashier Module
- Login, dashboard, fast search, **receipt printing with discounts**, OR/SI numbering, advance payment logic, **discount/rebate application**

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
    - **Receipt Setup** (NEW - Feb 23, 2026)
    - **Rebates** (IMPLEMENTED - Feb 23, 2026)
    - Printer Setup (placeholder)
    - SOA Setup (placeholder)
    - Company

- [x] **Receipt Setup Page** (NEW - Feb 23, 2026)
  - Company logo upload (PNG/JPEG, max 500KB)
  - Company information: Name, **Branch (optional)**, Address, Mobile, Email, TIN
  - Receipt settings: Title, OR/SI Prefix, Paper Width (48mm/58mm)
  - VAT settings: Registered checkbox, VAT percentage
  - Footer text customization with **multi-line support (Enter key)**
  - Auto-print after payment toggle
  - Live receipt preview (48mm/58mm format)
  - Print Preview button
  - Bluetooth Printer Info section

- [x] **Rebates & Discounts Module** (NEW - Feb 23, 2026)
  - Admin page for managing discounts
  - Discount types: Fixed amount (₱) or Percentage (%)
  - Duration options: One-time only or Recurring (every billing)
  - Apply to: All Active Subscribers, Selected Subscribers, or By Plan
  - Multi-select for subscribers and plans
  - Stats cards: Total Discounts Given, Times Used, Active Discounts
  - Activate/Deactivate toggle
  - Edit and Delete functionality
  - Dashboard card showing Total Discounts
  - Cashier UI shows available discounts during payment
  - Click to toggle discount on/off
  - Shows amount to pay after discount
  - Receipt includes discount breakdown (Subtotal, Discount, Total Paid)
  - One-time discounts tracked per subscriber (can't be used twice)

- [x] **Subscriber Portal** (NEW - Feb 23, 2026)
  - Dedicated subscriber login page at `/subscriber/login`
  - Login with account number and password (default: last 4 digits of mobile)
  - Mobile-responsive dashboard
  - Quick stats: Payables, **Wallet Credit**, Unpaid Bills, Open Jobs, Account Status
  - **Bills Tab**: View current outstanding bills with amounts and due dates
  - **Payments Tab**: View payment history with OR numbers, amounts, modes
  - **Jobs Tab**: View job orders with status badges (Open/Completed)
  - **Account Tab**: View account info, plan, **wallet balance**, contact details, change password
  - **Notifications**: Auto-generated alerts for outstanding balance, disconnection, **wallet credit availability**
  - Refresh button to reload data
  - Logout functionality
  - Cross-links between Staff Login and Subscriber Portal Login
  - "Pay Now" button placeholder for future online payment integration

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

1. ~~**Subscriber Portal - Online Payments**~~ ✅ COMPLETED (Feb 24, 2026) - PayMongo integration with service fee
   - Admin can configure service fee in PayMongo settings
   - Service fee displayed as separate line item during checkout
   - Breakdown shows Subtotal + Service Fee = Total
2. **Billing PDF/SOA Generation** - Generate PDF statements
3. **Mikrotik Management Page** - UI for admin to configure Mikrotik credentials
4. **Backend Refactoring (P0 - CRITICAL)** - server.py is 6000+ lines, needs modularization into routes/, models/, services/

---

## Future/Backlog Tasks

- Subscriber Portal - Chat Support (real-time chat feature)
- Subscriber Portal - Notification System (service interruptions, billing reminders)
- Subscriber Portal - Knowledge Base (FAQs, help articles)
- Admin Settings (discounts/rebates configuration, import/export)
- Company Setup page
- Wallet Management UI (admin manual add/deduct credits)
- Auto-email SOA
- Automatic SMS triggers for billing events
- Complete Philippine address data (municipalities/barangays)
- Backend code refactoring (server.py is 5000+ lines - needs modularization CRITICAL)
- Printer Setup configuration (Bluetooth printer pairing settings)
- SOA Template configuration

---

## Technical Stack

- **Backend:** FastAPI, Pydantic, MongoDB (motor), APScheduler
- **Frontend:** React, React Router, Axios, TailwindCSS, Shadcn/UI, Recharts
- **Integrations:** routeros-api (Mikrotik), ReportLab (PDF), Web Bluetooth API (thermal printers)

---

## Test Credentials

- **Admin:** admin / @Gello1006
- **Cashier:** cashier1 / test123
- **Technician:** tech1 / test123
- **Subscriber:** ACC4307BC6B / 0000 (Test Subscriber)

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
- `/app/test_reports/iteration_10.json` - Receipt printing and discounts testing
- `/app/test_reports/iteration_11.json` - Subscriber Portal testing (100% pass rate)
- `/app/test_reports/iteration_8.json` - Cashier module enhancements (100% pass rate)
- `/app/test_reports/iteration_9.json` - Expense module testing (100% pass rate)

---

## Changelog (Feb 26, 2026)

### Feature: Subscriber Management Mobile Optimization
- **Search Bar:** Now full-width on mobile, stacks vertically with other controls
- **Table:** Responsive design with combined columns for mobile
  - Account + Name combined (shows phone, plan, wallet on mobile)
  - Contact, Plan, Installation, Wallet columns hide on smaller screens
  - Status column shows Active/Inactive + PPPoE status
- **Pagination:** Improved mobile layout with stacked rows and compact controls
- **Tab Headers (Record Modal):** Auto-wrap on mobile with icons stacked vertically
- **Files Modified:**
  - `/app/frontend/src/components/admin/SubscriberManagement.js`
  - `/app/frontend/src/components/ui/table-pagination.jsx`

### Bug Fix: Subscriber Portal Login
- **Issue:** Subscribers couldn't log in because the system checked `mobile` field but data was in `phone` field
- **Fix:** Updated login to check both `mobile` OR `phone` field for default password generation
- **File Modified:** `/app/backend/server.py` - `subscriber_login` endpoint
- **Default Password:** Last 4 digits of mobile/phone number, or '0000' if not set

### Feature: Dashboard Time Period Filters
- **Added:** Time-based filter buttons (Today, This Week, This Month, This Year, All Time) to the Admin Dashboard
- **Added:** New `/api/dashboard/stats` endpoint now accepts `period` query parameter
- **Added:** New `/api/dashboard/billing-overview` endpoint for comprehensive billing statistics
- **Backend:** Both endpoints calculate stats based on selected period and compare with previous period
- **Frontend:** Filter buttons dynamically update all stats, billing overview, and show period indicator
- **Files Modified:** 
  - `/app/backend/server.py` - Enhanced `get_dashboard_stats`, added `get_billing_overview`
  - `/app/frontend/src/pages/AdminDashboard.js` - Added filter UI and billing overview card
- **Testing:** Verified via curl and UI screenshots - all filters working correctly

### Bug Fix: Expense Management Page "Failed to load expenses" Error
- **Issue:** The Expense Management page was showing a "Failed to load expenses" error
- **Root Cause:** The `expense_date` field was stored as strings (from CSV imports) but the analytics code assumed they were datetime objects. Calling `.replace(tzinfo=...)` on a string threw `TypeError: str.replace() takes no keyword arguments`
- **Fix:** Added a `parse_expense_date()` helper function in `server.py` that safely converts both strings and datetime objects to timezone-aware datetime
- **Files Modified:** `/app/backend/server.py` - Lines ~4630-4750 in `get_expense_analytics` endpoint
- **Testing:** Verified via curl and UI screenshots - all expenses and analytics load correctly