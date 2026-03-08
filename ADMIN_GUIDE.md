# 🧾 GST Reconciliation & Audit Tool — Admin Guide

> **By TechBharat Studios** | Last updated: March 2026

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Architecture & File Map](#architecture--file-map)
3. [How the App Works (User Flow)](#how-the-app-works)
4. [Admin Dashboard Guide](#admin-dashboard-guide)
5. [Managing Users](#managing-users)
6. [Access Control: Exports vs Days vs Both](#access-control)
7. [Device & Abuse Prevention](#device--abuse-prevention)
8. [Google Sheets Sync](#google-sheets-sync)
9. [Client Onboarding](#client-onboarding)
10. [Troubleshooting](#troubleshooting)
11. [Database Reference](#database-reference)
12. [Edge Functions](#edge-functions)

---

## 🏗 System Overview

This is a **GST reconciliation tool** that helps accountants/businesses match:
- **Tally data** ↔ **GSTR-2B government data**
- **Purchase Register** ↔ **Tally data**
- **Combined (merged) files** ↔ **GSTR-2B**

Users get **10 free exports**, after which they must contact you to purchase more access.

### Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Lovable Cloud (Supabase) — Database, Auth, Edge Functions
- **Hosting**: Lovable (published at `gstr2b3breconciliation.lovable.app`)

---

## 🗂 Architecture & File Map

```
📁 Project Root
├── 📁 src/
│   ├── App.tsx                    → Main router (routes: /, /auth, /admin)
│   ├── main.tsx                   → App entry point
│   ├── index.css                  → Global styles & design tokens
│   │
│   ├── 📁 pages/
│   │   ├── Tool.tsx               → ⭐ MAIN PAGE — File upload, reconciliation, export
│   │   ├── Auth.tsx               → Login/Signup page
│   │   ├── Admin.tsx              → Admin dashboard (users, exports, devices)
│   │   ├── Index.tsx              → Fallback landing page
│   │   └── NotFound.tsx           → 404 page
│   │
│   ├── 📁 components/
│   │   ├── Navbar.tsx             → Top navigation bar with auth buttons
│   │   ├── Footer.tsx             → Footer with credits
│   │   ├── AuthModal.tsx          → Login/Signup modal popup
│   │   ├── ContactPaywall.tsx     → "Contact us to unlock" modal after free exports end
│   │   ├── NavLink.tsx            → Navigation link component
│   │   └── 📁 ui/                → Shadcn UI components (buttons, cards, tabs, etc.)
│   │
│   ├── 📁 hooks/
│   │   ├── useAuth.ts             → Authentication hook (login, signup, signout, user state)
│   │   ├── use-mobile.tsx         → Mobile detection hook
│   │   └── use-toast.ts           → Toast notification hook
│   │
│   ├── 📁 lib/
│   │   ├── gst-parsers.ts        → 📊 Parses uploaded Excel files (Tally, GSTR-2B, PR)
│   │   ├── gst-reconcile.ts      → 🔍 Core reconciliation logic (matching invoices)
│   │   ├── gst-downloads.ts      → 📥 Generates and downloads reconciled Excel reports
│   │   ├── gst-helpers.ts        → Helper constants and utilities for GST processing
│   │   ├── fingerprint.ts        → 🔒 Device fingerprinting for abuse prevention
│   │   └── utils.ts              → General utility functions
│   │
│   └── 📁 integrations/
│       ├── 📁 supabase/
│       │   ├── client.ts          → Supabase client (auto-generated, DO NOT EDIT)
│       │   └── types.ts           → Database types (auto-generated, DO NOT EDIT)
│       └── 📁 lovable/
│           └── index.ts           → Lovable integration
│
├── 📁 supabase/
│   ├── config.toml                → Supabase configuration (DO NOT EDIT)
│   └── 📁 functions/
│       ├── 📁 get-client-ip/
│       │   └── index.ts           → Edge function to get user's real IP address
│       └── 📁 sync-to-sheets/
│           └── index.ts           → Edge function to sync data to Google Sheets
│
├── 📁 public/
│   ├── favicon.ico
│   ├── robots.txt
│   └── placeholder.svg
│
├── ADMIN_GUIDE.md                 → 📖 THIS FILE — You're reading it!
├── package.json                   → Dependencies
├── tailwind.config.ts             → Tailwind CSS configuration
├── vite.config.ts                 → Vite build configuration
└── index.html                     → HTML entry point
```

### How Files Connect

```
User visits / → App.tsx → Tool.tsx
                            ├── useAuth.ts (checks login status)
                            ├── Navbar.tsx (shows login/signup buttons)
                            ├── gst-parsers.ts (parses uploaded files)
                            ├── gst-reconcile.ts (matches invoices)
                            ├── gst-downloads.ts (generates Excel output)
                            ├── fingerprint.ts (tracks device)
                            └── ContactPaywall.tsx (shown when exports exhausted)

User visits /admin → Admin.tsx
                      ├── useAuth.ts (checks if logged in)
                      ├── supabase RPCs (admin_get_all_profiles, etc.)
                      └── sync-to-sheets edge function

User visits /auth → Auth.tsx
                     └── useAuth.ts (signUp / signIn)
```

---

## 🔄 How the App Works

### User Journey
1. **User visits the site** → sees the tool page
2. **User uploads Excel files** (Tally export + GSTR-2B download)
3. **Tool parses and reconciles** the data automatically
4. **User clicks "Download"** → triggers export
5. **System checks**:
   - Is user logged in? → If not, show AuthModal
   - Is user blocked? → If yes, deny export
   - Has user exceeded export limit? → If yes, show ContactPaywall
   - Is device blocked or at limit? → If yes, deny
6. **Export succeeds** → Excel file downloaded, export logged in database

### Reconciliation Modes
| Mode | What it does |
|------|-------------|
| `tally` | Compares Tally data ↔ GSTR-2B |
| `full` | Full reconciliation with detailed mismatch analysis |
| `combined` | Merged/combined file ↔ GSTR-2B |
| `prtally` | Purchase Register ↔ Tally audit |

---

## 🛡 Admin Dashboard Guide

### Accessing the Dashboard
1. Go to `yourdomain.com/admin`
2. You must be logged in with an admin role
3. Your email `techbharatstudios@gmail.com` already has admin access

### Dashboard Sections

#### 📊 Stats Cards (Top)
- **Total Users** — Number of registered users
- **Total Exports** — Total downloads across all users
- **Blocked Users** — Users you've manually blocked
- **Blocked Devices** — Devices flagged for abuse

#### 👥 Users Tab
Shows all registered users with:
- Name, User ID, Phone
- **Access Mode** — Click the badge to change (Exports / Days / Both)
- **Max Exports** — Click the number to edit
- **Expires** — When day-based access expires
- **Status** — Active or Blocked
- **Actions** — Block / Unblock user

#### 📥 Exports Tab
Shows all export logs with:
- Date, User ID, Export Type
- IP Address, Device Fingerprint

#### 🔒 Devices Tab
Shows tracked devices with:
- Fingerprint hash, IP, linked User ID
- Export count, Status (Active/Blocked)
- Actions — Block / Unblock device

---

## 👤 Managing Users

### Block a User
1. Go to **Admin → Users tab**
2. Find the user
3. Click the red **Block** button
4. User will immediately be unable to export

### Unblock a User
1. Find the blocked user (shown with red "Blocked" badge)
2. Click **Unblock**

### Change Export Limit
1. Click the number under **Max Exports** column
2. Type the new limit
3. Click ✓ to save

### Change Access Mode
1. Click the **Access Mode** badge for a user
2. Select mode:
   - **By Exports** — User limited by number of downloads
   - **By Days** — User has access until a specific date
   - **Both** — Must satisfy BOTH conditions (exports remaining AND not expired)
3. If choosing "Days" or "Both", set the expiry date/time
4. Click ✓ to save

---

## 🔐 Access Control

### Three Modes

| Mode | How it works | Best for |
|------|-------------|----------|
| **By Exports** (default) | User gets X exports, then blocked | Pay-per-use clients |
| **By Days** | User has unlimited exports until expiry date | Monthly subscription clients |
| **Both** | User needs exports remaining AND not expired | Premium time-limited packages |

### Default Behavior
- New users get **10 free exports** in "By Exports" mode
- After exhausting exports → ContactPaywall shown with your WhatsApp/Email
- Client contacts you → you negotiate payment → you update their access in admin

---

## 🛡 Device & Abuse Prevention

### How It Works
The system tracks **two things** per export:
1. **Device Fingerprint** — A hash of browser characteristics (screen size, fonts, etc.)
2. **IP Address** — Captured via edge function for accuracy

### Limits
- Each unique device/IP combo is limited to **15 exports total**
- This prevents users from creating multiple accounts to bypass limits

### What to Do If Someone Abuses
1. Go to **Admin → Devices tab**
2. Find the suspicious device (high export count, multiple user IDs)
3. Click **Block** to permanently block that device
4. Optionally also block the user in the Users tab

---

## 📊 Google Sheets Sync

### What It Does
Pushes all signup and export data to a Google Sheet for backup/reporting.

### How to Use
1. Go to Admin Dashboard
2. Click **"Sync to Sheets"** button (top right)
3. Data syncs to Sheet ID: `1lWsCfU5scNRHyWutQlUosI1xzvGA0BOlo5kgMMtehFM`

### Configured Secrets (already set)
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_KEY`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

---

## 🤝 Client Onboarding

### Step-by-Step: New Client

1. **Client contacts you** (WhatsApp/Email after hitting free limit)
2. **Negotiate pricing** — per-export or time-based access
3. **Receive payment**
4. **Go to Admin Dashboard** → Users tab
5. **Find the client** by name or User ID
6. **Choose access mode**:
   - For pay-per-use: Keep "By Exports", increase max exports (e.g., 50, 100)
   - For monthly access: Change to "By Days", set expiry 30 days from now
   - For premium: Change to "Both" with appropriate limits
7. **Confirm** — Client can now export again immediately

### Step-by-Step: Returning Client (Renewal)

1. Go to Admin → Users tab
2. Find the client
3. Either:
   - **Increase max exports** if they need more downloads
   - **Extend expiry date** if on day-based access
   - **Unblock** if they were auto-blocked

---

## 🔧 Troubleshooting

### "Admin page shows infinite spinner"
- **Cause**: Auth state not resolving
- **Fix**: Make sure you're logged in. Try logging out and back in.

### "User says they can't export but shouldn't be blocked"
1. Check their profile in Admin → Users:
   - Is `is_blocked` true? → Unblock them
   - Is export count ≥ max_exports? → Increase limit
   - Is access_expires_at in the past? → Extend date
2. Check their device in Admin → Devices:
   - Is the device blocked? → Unblock it
   - Is device export_count ≥ 15? → This is the device limit

### "Google Sheets sync fails"
- Check that the secrets are still valid (service account key may expire)
- The sheet ID must match the configured one
- Check edge function logs in Lovable Cloud

### "User can't sign up or log in"
- Check if their email is valid
- Users must verify their email before signing in (confirmation email sent)
- If email not arriving, check spam folder

### "I want to add a new admin"
- You need to insert a row in the `user_roles` table:
  - `user_id` = the user's UUID (find in Users tab)
  - `role` = `admin`
- This requires database access through Lovable Cloud

---

## 🗄 Database Reference

### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profile data (name, phone, export limits, access mode, blocked status) |
| `export_logs` | Every export logged with user, type, IP, fingerprint |
| `device_fingerprints` | Tracked devices with export counts and block status |
| `user_roles` | Admin/moderator/user role assignments |

### Key Database Functions (RPCs)

| Function | What it does |
|----------|-------------|
| `can_user_export(user_id)` | Checks if user can export (not blocked, within limits/expiry) |
| `can_device_export(fingerprint, ip)` | Checks if device can export (not blocked, under 15) |
| `log_export_with_device(user_id, type, fingerprint, ip)` | Logs an export and updates device tracking |
| `get_export_count(user_id)` | Returns total exports for a user |
| `has_role(user_id, role)` | Checks if user has a specific role |
| `admin_get_all_profiles()` | Returns all user profiles (admin only) |
| `admin_get_all_export_logs()` | Returns last 500 exports (admin only) |
| `admin_get_all_devices()` | Returns all tracked devices (admin only) |
| `admin_set_user_blocked(user_id, blocked)` | Block/unblock a user (admin only) |
| `admin_set_device_blocked(fingerprint, blocked)` | Block/unblock a device (admin only) |
| `admin_set_max_exports(user_id, max)` | Update a user's export limit (admin only) |
| `admin_set_access_mode(user_id, mode, expires_at)` | Set access mode and expiry (admin only) |

### Security
- All admin functions check `has_role(auth.uid(), 'admin')` before executing
- Row Level Security (RLS) ensures users can only see their own data
- Device fingerprints are hashed for privacy

---

## 📁 Edge Functions

### `get-client-ip`
- **Purpose**: Returns the real client IP address
- **Used by**: Export logging to track IP-based abuse
- **Location**: `supabase/functions/get-client-ip/index.ts`

### `sync-to-sheets`
- **Purpose**: Syncs all signups and exports to Google Sheets
- **Used by**: Admin dashboard "Sync to Sheets" button
- **Location**: `supabase/functions/sync-to-sheets/index.ts`
- **Requires**: Google service account credentials (already configured)

---

## 💡 Quick Reference Card

| Action | Where to do it |
|--------|---------------|
| Block a user | Admin → Users → Block button |
| Give more exports | Admin → Users → Click max exports number |
| Give time-based access | Admin → Users → Click access mode badge → "By Days" |
| Block a device | Admin → Devices → Block button |
| Sync to Google Sheets | Admin → "Sync to Sheets" button |
| View export history | Admin → Exports tab |
| Check why user can't export | Admin → Check user status + device status |
| Onboard new paid client | Admin → Users → Update access mode + limits |

---

*Built with ❤️ by TechBharat Studios using Lovable*
