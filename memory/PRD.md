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

### Completed Features (as of Feb 4, 2026)

#### Backend (FastAPI)
- [x] JWT Authentication with role-based access
- [x] User Management (admin, cashier, tech, billing roles)
- [x] Subscription Plans CRUD
- [x] Subscriber Management with Philippine address structure
- [x] PPPoE Account fields integrated in subscriber form
- [x] Prorated billing on new subscriber creation
- [x] **Automatic Billing Scheduler (APScheduler)**
  - Runs daily at 00:01 AM
  - Generates invoices for subscribers on their billing day (15th or 30th)
  - Billing status API
  - Manual billing trigger
  - Billing logs history
  - Upcoming billing preview
- [x] Payment processing with OR number generation
- [x] Payment history per subscriber
- [x] Invoice management
- [x] Dashboard statistics API
- [x] Mikrotik integration structure (awaiting credentials)

#### Frontend (React)
- [x] Login page with role-based routing
- [x] Admin Dashboard with:
  - Sales metrics and charts
  - **Billing Calendar View**
    - Visual calendar showing billing dates (15th, 30th)
    - Subscriber counts per billing period
    - Days until next billing
    - Auto-billing scheduler status
    - Pending invoices indicator
  - Billing Quick Actions panel
- [x] Subscriber Management with:
  - Cascading address dropdowns (Province > Municipality > Barangay)
  - PPPoE configuration fields
  - Auto-generated PPPoE username (firstnamelastname format)
  - View Payment History dialog
  - **Prorated Billing Option** with real-time preview
  - **Change Plan** with prorated adjustment billing
  - **Deactivate Subscriber** with final bill calculation and Mikrotik profile change
  - **Reactivate Subscriber** with prorated billing
  - **Delete Subscriber** with admin password confirmation
  - **Add Manual Charges** (equipment, service fees, etc.)
- [x] Cashier Dashboard with subscriber search and payment
- [x] Subscription Plans management
- [x] User Management

---

## Pending Issues

| Priority | Issue | Status |
|----------|-------|--------|
| P2 | PPPoE Profile dropdown is static (not fetching from Mikrotik) | Not Started |

---

## Upcoming Tasks (P0-P1)

1. **Mikrotik Management Page** - UI for admin to configure Mikrotik credentials
2. **Technician Module** - Login, dashboard, job order fulfillment
3. **Subscriber Portal** - Login and dashboard for subscribers
4. **Billing PDF/SOA Generation** - Generate PDF statements

---

## Future/Backlog Tasks

- Admin Settings (discounts, import/export)
- Company Setup page
- Inventory Management module
- Expenses module
- Receipt printing
- OR/SI numbering logic
- Wallet/credit ledger for advance payments
- Auto-email SOA
- Automatic SMS triggers
- Complete Philippine address data (municipalities/barangays)

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
