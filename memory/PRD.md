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

### Completed Features (as of Feb 5, 2026)

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
  - View Records dialog (payment history, wallet, invoices)
  - **Prorated Billing Option** with real-time preview
  - **Change Plan** with prorated adjustment billing
  - **Deactivate Subscriber** with final bill calculation
  - **Reactivate Subscriber** with prorated billing
  - **Delete Subscriber** with admin password confirmation
  - **Add Manual Charges** (equipment, service fees, etc.)
- [x] **Cashier Dashboard**
  - Universal search (by account number, name, or phone)
  - **Centralized Payment Form** with FIFO allocation
  - Invoice list with status badges (Unpaid, Partial, Paid)
  - Payment history with descriptions
  - Today's Collections (live updated)
  - Wallet Balance display
- [x] **Subscription Plans Management**
  - Full CRUD (Create, Edit, Delete)
- [x] **User Management**
  - Full CRUD with Change Password functionality
- [x] **Inventory Management** (NEW - Feb 5, 2026)
  - Stats cards (Total Items, Total Value, Low Stock, Categories)
  - Low stock alerts with restock badge
  - Item list with search and category filter
  - Add/Edit/Delete inventory items
  - Track standard items, bulk items (length), and serialized items
  - **Manage Units dialog** for serialized items
    - List units with MAC address, serial number, status
    - Assign/Available/Defective status badges
    - Add new units with MAC/Serial
    - Delete available units

---

## Pending Issues

| Priority | Issue | Status |
|----------|-------|--------|
| P2 | PPPoE Profile dropdown is static (not fetching from Mikrotik) | Not Started |
| P2 | Address data for municipalities and barangays is incomplete sample data | Not Started |

---

## Upcoming Tasks (P0-P1)

1. **Technician Module** - Login, dashboard, job order fulfillment with material entry from inventory
2. **Subscriber Portal** - Login (account number) and dashboard for subscribers
3. **Billing PDF/SOA Generation** - Generate PDF statements
4. **Mikrotik Management Page** - UI for admin to configure Mikrotik credentials

---

## Future/Backlog Tasks

- Admin Settings (discounts, import/export)
- Company Setup page
- Expenses module
- Wallet Management UI (admin manual add/deduct credits)
- Receipt printing
- OR/SI numbering logic
- Auto-email SOA
- Automatic SMS triggers for billing events
- Complete Philippine address data (municipalities/barangays)
- Backend code refactoring (server.py is 2700+ lines - needs modularization)

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
