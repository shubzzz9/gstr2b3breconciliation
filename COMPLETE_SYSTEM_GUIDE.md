# 🧾 GST Reconciliation & Audit Tool — Complete System Guide

> **By TechBharat Studios** | Last updated: March 2026
> 
> This document is written for a **non-technical person** to fully understand, operate, troubleshoot, and hand over this entire system. No coding knowledge needed.

---

## 📖 TABLE OF CONTENTS

1. [What This Tool Does (In Simple Words)](#1-what-this-tool-does)
2. [How Users Experience the Tool](#2-how-users-experience-the-tool)
3. [How You Make Money From It](#3-how-you-make-money-from-it)
4. [The Admin Dashboard — Your Control Panel](#4-the-admin-dashboard)
5. [Complete File Map — What Each File Does](#5-complete-file-map)
6. [How Files Are Connected to Each Other](#6-how-files-are-connected)
7. [The Database — Where All Data Lives](#7-the-database)
8. [Security & Access Control](#8-security--access-control)
9. [All Integrations & External Services](#9-all-integrations--external-services)
10. [All Secret Keys & Credentials](#10-all-secret-keys--credentials)
11. [Google Sheets Sync — How It Works](#11-google-sheets-sync)
12. [Step-by-Step: Common Admin Tasks](#12-common-admin-tasks)
13. [Troubleshooting — What to Do When Things Break](#13-troubleshooting)
14. [If You Want to Change Something](#14-if-you-want-to-change-something)
15. [Handing Over This System to Someone New](#15-handover-checklist)
16. [Technical Reference (For a Developer)](#16-technical-reference)

---

## 1. WHAT THIS TOOL DOES

Imagine you're a CA (Chartered Accountant) or a business owner. Every quarter, the Indian government gives you a file called **GSTR-2B** — it lists all the invoices your suppliers have reported.

You also have your **own purchase records** in Tally or Excel.

**The problem**: You need to match these two lists — find which invoices match, which are missing, which have wrong amounts. Doing this manually takes hours.

**This tool does it in seconds.** Users upload their files, and the tool automatically:
- Reads both files
- Matches invoices by GSTIN + Invoice Number
- Flags mismatches (wrong amounts, missing invoices, GSTIN typos)
- Creates a beautiful Excel report they can download

### The 4 Options the Tool Offers

| Option | What the user uploads | What they get |
|--------|----------------------|--------------|
| **Option 1** — Convert to GSTR-2B Format | Any purchase file (Tally, etc.) | Same data reformatted into GSTR-2B column layout |
| **Option 2** — Full Reconciliation ⭐ | Purchase file + GSTR-2B from GST portal | Complete match report + mismatch diagnosis |
| **Option 3** — Combined File Reconciliation | Single file with both datasets (marked "GSTR 2B" / "Our Data") | Same as Option 2 but from one file |
| **Option 4** — Purchase Register vs Tally Audit | Client's purchase sheet + Tally data | Line-by-line audit showing differences |

---

## 2. HOW USERS EXPERIENCE THE TOOL

Here's the exact journey a user takes:

```
Step 1: User visits your website
        ↓
Step 2: Sees the tool with 4 options — no login needed to start
        ↓
Step 3: Uploads their Excel files (everything happens in their browser — files are NEVER sent to any server)
        ↓
Step 4: Tool auto-detects columns, user confirms the mapping
        ↓
Step 5: Tool processes and reconciles the data (takes 1-3 seconds)
        ↓
Step 6: User sees results and clicks "Download"
        ↓
        ┌─ Not logged in? → Login/Signup popup appears
        │                    (can use Email+Password or Google Sign-In)
        │
        ├─ Logged in but exports exhausted? → "Contact Us" popup appears
        │                                      (shows your WhatsApp + Email)
        │
        ├─ User is blocked? → Same "Contact Us" popup
        │
        └─ All good? → Excel file downloads successfully!
             ↓
             Export is logged in database (user, IP, device fingerprint, timestamp)
```

### Key Point: "Try Before You Buy"
Users can do EVERYTHING — upload, map columns, process, see results — **without creating an account**. They only need to sign up at the very last step (downloading). This makes them more likely to sign up because they've already invested time and seen the value.

---

## 3. HOW YOU MAKE MONEY FROM IT

### The Business Model

```
New user signs up → Gets 10 FREE exports
                            ↓
              Uses all 10 → Sees "Contact Us" paywall
                            ↓
         Contacts you on WhatsApp/Email
                            ↓
           You negotiate pricing
          (per-export or time-based)
                            ↓
        User pays you directly (UPI, bank transfer, etc.)
                            ↓
      You go to Admin Dashboard → increase their limits
                            ↓
             User can export again immediately!
```

### Pricing Strategies You Can Use

| Strategy | How to set it up in Admin | Example |
|----------|--------------------------|---------|
| **Pay-per-export** | Keep "By Exports" mode, increase max exports | ₹500 for 50 exports |
| **Monthly subscription** | Switch to "By Days" mode, set expiry 30 days out | ₹1000/month unlimited |
| **Premium package** | Switch to "Both" mode — exports AND time limit | 100 exports valid for 60 days |

### Your Contact Details (Shown to Users)
- **Email**: techbharatstudios@gmail.com
- **WhatsApp**: +91 8668606224
- These appear in the ContactPaywall popup and in the footer

---

## 4. THE ADMIN DASHBOARD

### How to Access
1. Go to: `https://gstr2b3breconciliation.lovable.app/admin`
2. You must be logged in with: **techbharatstudios@gmail.com**
3. This email has the `admin` role in the database

### What You See

#### Top Bar
- **Stats**: Total Users | Total Exports | Blocked Users | Blocked Devices
- **Sync to Sheets** button — pushes all data to your Google Sheet
- **Back to Tool** button — go back to the main tool

#### Three Tabs

**👥 Users Tab** — Shows every registered user:
| Column | What it means |
|--------|--------------|
| Name | Their full name from signup |
| User ID | Unique identifier (first 8 chars shown) |
| Phone | Phone number (if they provided one) |
| Access Mode | How their access is limited — click to change |
| Max Exports | Their export limit — click the number to change |
| Expires | When their access expires (for day-based mode) |
| Status | Active (green) or Blocked (red) |
| Joined | When they signed up |
| Actions | Block / Unblock button |

**📥 Exports Tab** — Shows every download ever made:
| Column | What it means |
|--------|--------------|
| Date | When the export happened |
| User ID | Who did it |
| Type | What kind of file (file1, file2, file3, file4) |
| IP Address | Their internet address |
| Fingerprint | Unique device identifier (for abuse detection) |

**🔒 Devices Tab** — Shows every unique device that's used the tool:
| Column | What it means |
|--------|--------------|
| Fingerprint | Unique browser hash |
| IP | Internet address |
| User ID | Which user account is linked |
| Exports | How many exports from this device |
| Status | Active or Blocked |
| Last Seen | Last time this device was used |
| Actions | Block / Unblock |

---

## 5. COMPLETE FILE MAP

Here's every single file in this project and what it does, explained in plain English:

### 📁 src/pages/ — The "Screens" of Your App

| File | What It Is | What It Does |
|------|-----------|-------------|
| `Tool.tsx` | **Main tool page** (505 lines) | The heart of the app. Handles file uploads, column mapping, processing, and download buttons. Shows the 4 options. This is what users see at `/` |
| `Auth.tsx` | **Login page** | Full-page login/signup form at `/auth`. Has email+password and Google sign-in |
| `Admin.tsx` | **Admin dashboard** | The control panel at `/admin`. Shows users, exports, devices. Only works for admin users |
| `Index.tsx` | **Unused fallback** | Legacy landing page, not actively used |
| `NotFound.tsx` | **404 page** | Shows when someone visits a URL that doesn't exist |

### 📁 src/components/ — Reusable Pieces

| File | What It Is | What It Does |
|------|-----------|-------------|
| `Navbar.tsx` | **Top navigation bar** | Shows the TechBharat Studios brand, login/signup buttons, and sign out |
| `Footer.tsx` | **Bottom footer** | Shows trust indicators (Instant Results, 100% Secure, etc.) and contact info |
| `AuthModal.tsx` | **Login popup** | Appears when user tries to download without being logged in. Same login/signup form as Auth.tsx but in a popup |
| `ContactPaywall.tsx` | **"Buy More" popup** | Appears when user has exhausted free exports. Shows your WhatsApp and email |
| `NavLink.tsx` | **Navigation link** | Simple link component used in navigation |
| `ui/` folder | **UI building blocks** | Buttons, cards, tabs, inputs, etc. Pre-made components from shadcn/ui library |

### 📁 src/lib/ — The "Brain" (Processing Logic)

| File | What It Does | Key Functions |
|------|-------------|---------------|
| `gst-parsers.ts` | **Reads Excel files** | `scanTally()` — finds header row and columns in purchase file; `processTally()` — extracts and groups invoice data; `scanGSTR2B()` / `parseGSTR2B()` — reads government GSTR-2B file; `parseCombined()` — reads combined files; `parsePurchaseRegister()` / `parseTally4()` — reads purchase register and Tally data for Option 4 |
| `gst-reconcile.ts` | **Matches invoices** | `reconcile()` — compares GSTR-2B rows with your data, marks as Matched / Fig Not Matched / Not in our data / Not in GSTR 2B; `diagnoseMismatches()` — explains WHY things don't match; `reconcilePRTally()` — compares Purchase Register vs Tally |
| `gst-downloads.ts` | **Creates Excel reports** | `downloadFile1()` — GSTR-2B format output; `downloadFile2()` — full reconciliation with remarks guide; `downloadFile3()` — mismatch diagnosis with 7 analysis sheets; `downloadPRTallyAudit()` — PR vs Tally audit report |
| `gst-helpers.ts` | **Utility functions** | Column definitions, date converters, number formatters, string cleaners, invoice similarity scoring |
| `fingerprint.ts` | **Device tracking** | Generates a unique hash from browser characteristics (screen size, GPU, fonts, etc.) to identify devices even if users create multiple accounts |
| `utils.ts` | **General utilities** | CSS class merging helper |

### 📁 src/hooks/ — Shared Logic

| File | What It Does |
|------|-------------|
| `useAuth.ts` | Manages login state. Provides `user`, `signIn()`, `signUp()`, `signOut()` to any component that needs it |
| `use-mobile.tsx` | Detects if user is on mobile device |
| `use-toast.ts` | Shows toast notification messages |

### 📁 src/integrations/ — External Connections

| File | What It Does | ⚠️ Important |
|------|-------------|-------------|
| `supabase/client.ts` | Connects to Lovable Cloud (database) | **AUTO-GENERATED — NEVER EDIT** |
| `supabase/types.ts` | Database type definitions | **AUTO-GENERATED — NEVER EDIT** |
| `lovable/index.ts` | Lovable platform integration (Google OAuth etc.) | Don't modify |

### 📁 supabase/functions/ — Server-Side Code

| Function | What It Does | When It Runs |
|----------|-------------|-------------|
| `get-client-ip/index.ts` | Returns the user's real IP address | Every time someone tries to export (for tracking) |
| `sync-to-sheets/index.ts` | Pushes all user + export data to Google Sheets | When admin clicks "Sync to Sheets" in admin panel |

### 📁 Root Files

| File | What It Does |
|------|-------------|
| `src/App.tsx` | **The router** — decides which page to show based on URL: `/` → Tool, `/auth` → Auth, `/admin` → Admin |
| `src/main.tsx` | App entry point — loads React |
| `src/index.css` | All colors, fonts, and visual styling (design tokens) |
| `index.html` | The base HTML file that loads everything |
| `tailwind.config.ts` | Configures the CSS framework (Tailwind) |
| `vite.config.ts` | Build tool configuration |
| `package.json` | Lists all software dependencies |
| `supabase/config.toml` | Backend configuration — **DO NOT EDIT** |
| `.env` | Environment variables — **AUTO-GENERATED, DO NOT EDIT** |
| `ADMIN_GUIDE.md` | Previous admin guide (still valid, more concise) |

---

## 6. HOW FILES ARE CONNECTED

### The Big Picture

```
index.html
  └── main.tsx (loads React)
        └── App.tsx (router)
              ├── "/" → Tool.tsx (main tool)
              │         ├── Navbar.tsx (top bar)
              │         ├── Footer.tsx (bottom)
              │         ├── AuthModal.tsx (login popup on download)
              │         ├── ContactPaywall.tsx (paywall popup)
              │         ├── useAuth.ts (login state)
              │         ├── fingerprint.ts (device tracking)
              │         ├── gst-parsers.ts → gst-helpers.ts
              │         ├── gst-reconcile.ts → gst-helpers.ts
              │         └── gst-downloads.ts → gst-helpers.ts
              │
              ├── "/auth" → Auth.tsx
              │              └── useAuth.ts
              │
              ├── "/admin" → Admin.tsx
              │               ├── useAuth.ts
              │               └── supabase/client.ts → (calls database functions)
              │
              └── "*" → NotFound.tsx (any unknown URL)
```

### Data Flow: What Happens During an Export

```
User clicks "Download"
      │
      ▼
Tool.tsx → handleDownload()
      │
      ├─ Is user logged in? (checks useAuth.ts)
      │   NO → Show AuthModal.tsx
      │         User logs in → handleAuthSuccess()
      │         Continue below ↓
      │
      ├─ trackExport() is called:
      │   │
      │   ├─ supabase.rpc('can_user_export') → checks profiles table
      │   │   (is_blocked? export count vs max_exports? expiry date?)
      │   │   FAIL → Show ContactPaywall.tsx
      │   │
      │   ├─ supabase.rpc('can_device_export') → checks device_fingerprints table
      │   │   (is device blocked? export count >= 15?)
      │   │   FAIL → Show ContactPaywall.tsx
      │   │
      │   └─ supabase.rpc('log_export_with_device') → logs the export
      │       (inserts into export_logs + updates device_fingerprints)
      │
      └─ gst-downloads.ts → downloadFile1/2/3/4()
          (generates styled Excel file and triggers browser download)
```

### Data Flow: Admin Dashboard

```
Admin visits /admin
      │
      ▼
Admin.tsx loads
      │
      ├─ useAuth.ts → gets current user
      ├─ supabase.rpc('has_role') → checks if user is admin
      │   NOT ADMIN → Shows "Access Denied"
      │
      ├─ Loads all data in parallel:
      │   ├─ supabase.rpc('admin_get_all_profiles') → all users
      │   ├─ supabase.rpc('admin_get_all_export_logs') → all exports (last 500)
      │   └─ supabase.rpc('admin_get_all_devices') → all devices
      │
      └─ Admin actions:
          ├─ Block/Unblock user → supabase.rpc('admin_set_user_blocked')
          ├─ Change max exports → supabase.rpc('admin_set_max_exports')
          ├─ Change access mode → supabase.rpc('admin_set_access_mode')
          ├─ Block/Unblock device → supabase.rpc('admin_set_device_blocked')
          └─ Sync to Sheets → supabase.functions.invoke('sync-to-sheets')
```

---

## 7. THE DATABASE

All your data is stored in Lovable Cloud (powered by Supabase). There are **4 tables**:

### Table: `profiles`
Stores info about every registered user.

| Column | Type | What It Is | Default |
|--------|------|-----------|---------|
| id | UUID | Auto-generated unique ID | Auto |
| user_id | UUID | Links to the auth system's user | Required |
| full_name | Text | User's name from signup | null |
| phone | Text | Phone number | null |
| is_blocked | Boolean | Is this user blocked from exporting? | false |
| max_exports | Integer | How many exports this user is allowed | 10 |
| access_mode | Text | `exports`, `days`, or `both` | `exports` |
| access_expires_at | Timestamp | When day-based access expires | null |
| created_at | Timestamp | When they signed up | now() |
| updated_at | Timestamp | Last profile change | now() |

### Table: `export_logs`
Every single export is recorded here.

| Column | Type | What It Is |
|--------|------|-----------|
| id | UUID | Unique export ID |
| user_id | UUID | Who exported |
| export_type | Text | `file1`, `file2`, `file3`, or `file4` |
| device_fingerprint | Text | Hash of the browser/device |
| ip_address | Text | User's IP address |
| created_at | Timestamp | When the export happened |

### Table: `device_fingerprints`
Tracks every unique device to prevent abuse.

| Column | Type | What It Is | Default |
|--------|------|-----------|---------|
| id | UUID | Unique device record ID | Auto |
| fingerprint | Text | SHA-256 hash of browser signals | Required |
| ip_address | Text | Last known IP | null |
| user_id | UUID | Last user who used this device | null |
| export_count | Integer | Total exports from this device | 0 |
| is_blocked | Boolean | Is this device blocked? | false |
| first_seen_at | Timestamp | First time device was seen | now() |
| last_seen_at | Timestamp | Last time device was used | now() |
| metadata | JSON | Extra device info | {} |

### Table: `user_roles`
Controls who is an admin.

| Column | Type | What It Is |
|--------|------|-----------|
| id | UUID | Unique role ID |
| user_id | UUID | The user |
| role | Enum | `admin`, `moderator`, or `user` |

**Currently**: Only `techbharatstudios@gmail.com` has the `admin` role.

### Database Functions (the "Actions" you can trigger)

These are pre-built functions in the database that the app calls:

| Function | Who Can Call It | What It Does |
|----------|----------------|-------------|
| `can_user_export(user_id)` | Any logged-in user (for self) | Returns true/false: checks blocked status, export count vs limit, expiry date |
| `can_device_export(fingerprint, ip)` | Any logged-in user | Returns true/false: checks device blocked status, export count < 15 |
| `log_export_with_device(user_id, type, fingerprint, ip)` | Any logged-in user (for self) | Records the export in export_logs AND updates device_fingerprints |
| `get_export_count(user_id)` | Any logged-in user (for self) | Returns how many exports this user has done |
| `has_role(user_id, role)` | System (security function) | Checks if a user has a specific role (e.g., admin) |
| `admin_get_all_profiles()` | Admin only | Returns ALL user profiles |
| `admin_get_all_export_logs()` | Admin only | Returns the last 500 exports |
| `admin_get_all_devices()` | Admin only | Returns ALL tracked devices |
| `admin_set_user_blocked(user_id, blocked)` | Admin only | Blocks or unblocks a user |
| `admin_set_max_exports(user_id, max)` | Admin only | Changes a user's export limit |
| `admin_set_access_mode(user_id, mode, expires_at)` | Admin only | Changes how a user's access is controlled |
| `admin_set_device_blocked(fingerprint, blocked)` | Admin only | Blocks or unblocks a device |
| `handle_new_user()` | System trigger | Automatically creates a profile when someone signs up |

### Row Level Security (RLS)
Every table has security rules:
- **Users can only see their own data** (profiles, export_logs)
- **Admin functions verify** `has_role(auth.uid(), 'admin')` before executing
- **Device fingerprints**: users can only view their own device record
- **User roles**: only admins can view role assignments

---

## 8. SECURITY & ACCESS CONTROL

### Three Layers of Protection

```
Layer 1: USER-LEVEL
├── is_blocked flag (you can block them)
├── max_exports limit (they run out)
└── access_expires_at (time-based expiry)

Layer 2: DEVICE-LEVEL
├── Fingerprint tracking (browser characteristics hash)
├── IP tracking (network address)
├── 15 exports per device hard limit
└── Device block flag (you can block devices)

Layer 3: DATABASE-LEVEL (RLS)
├── Users can only read/write their own data
├── Admin functions require admin role
└── All sensitive operations go through SECURITY DEFINER functions
```

### How Device Fingerprinting Works
When someone uses the tool, `fingerprint.ts` collects:
- User agent (browser type)
- Screen resolution and color depth
- Language settings
- Timezone
- Number of CPU cores
- Available RAM
- Canvas rendering (how the browser draws shapes — unique per device)
- WebGL renderer (GPU information)

All of this is hashed into a single string. Same device = same hash. Different device = different hash.

**Why this matters**: If someone creates 3 accounts to get 30 free exports, the device fingerprint catches them — the device will hit the 15-export limit regardless of which account they're using.

### Authentication Methods
1. **Email + Password** — user signs up, gets verification email, then can log in
2. **Google Sign-In** — one-click via Google account (managed by Lovable Cloud, no configuration needed)

**Important**: Email verification is REQUIRED. Users must click the link in their email before they can log in. This prevents fake signups.

---

## 9. ALL INTEGRATIONS & EXTERNAL SERVICES

| Service | What It Does | Where It's Used | Credentials Needed |
|---------|-------------|-----------------|-------------------|
| **Lovable Cloud** | Database, authentication, edge functions, hosting | Entire backend | Auto-configured (no action needed) |
| **Google OAuth** | "Sign in with Google" button | AuthModal.tsx, Auth.tsx | Managed by Lovable Cloud automatically |
| **Google Sheets API** | Syncs data to your Google Sheet | sync-to-sheets edge function | Service account credentials (already set) |
| **xlsx-js-style** | Reads and writes styled Excel files | gst-parsers.ts, gst-downloads.ts | No credentials needed (JavaScript library) |

### How the Google Sheets Integration Works

```
Admin clicks "Sync to Sheets"
      │
      ▼
Tool.tsx calls supabase.functions.invoke('sync-to-sheets')
      │
      ▼
Edge function (sync-to-sheets/index.ts) runs:
  1. Reads GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY from secrets
  2. Creates a JWT token and exchanges it for a Google access token
  3. Fetches ALL profiles and export_logs from database
  4. Creates/ensures two tabs in the Google Sheet: "User Signups" and "Export Logs"
  5. Writes all data to those tabs (overwrites existing data)
  6. Returns success/failure to the admin dashboard
```

---

## 10. ALL SECRET KEYS & CREDENTIALS

These are stored securely in Lovable Cloud and are **never visible in the code**:

| Secret Name | What It Is | Where It's Used | How to Get a New One |
|-------------|-----------|-----------------|---------------------|
| `GOOGLE_SHEET_ID` | ID of your Google Sheet for data sync | sync-to-sheets function | Create a new Google Sheet, copy the ID from the URL |
| `GOOGLE_CLIENT_EMAIL` | Google service account email | sync-to-sheets function | Google Cloud Console → Service Accounts |
| `GOOGLE_PRIVATE_KEY` | Private key for Google service account | sync-to-sheets function | Google Cloud Console → Service Accounts → Keys |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Full service account JSON | Legacy/backup | Same as above |
| `SUPABASE_URL` | Backend API URL | Edge functions | Auto-configured by Lovable Cloud |
| `SUPABASE_ANON_KEY` | Public API key (safe to expose) | Frontend client | Auto-configured |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin-level API key (NEVER expose) | Edge functions only | Auto-configured |
| `SUPABASE_PUBLISHABLE_KEY` | Same as anon key | Frontend | Auto-configured |
| `SUPABASE_DB_URL` | Direct database connection | Not actively used | Auto-configured |
| `LOVABLE_API_KEY` | Lovable platform key | AI features | Auto-configured |

### Your Google Sheet
- **Sheet ID**: `1lWsCfU5scNRHyWutQlUosI1xzvGA0BOlo5kgMMtehFM`
- **Tabs**: "User Signups" and "Export Logs"
- **Access**: The Google service account email must have Editor access to this sheet

---

## 11. GOOGLE SHEETS SYNC

### What Gets Synced

**"User Signups" tab:**
| User ID | Full Name | Phone | Is Blocked | Max Exports | Created At | Updated At |

**"Export Logs" tab:**
| ID | User ID | Export Type | Device Fingerprint | IP Address | Created At |

### How to Sync
1. Log in as admin at `/admin`
2. Click the **"Sync to Sheets"** button (top right, next to "Back to Tool")
3. Wait for the spinner — it typically takes 2-5 seconds
4. You'll see a success toast: "Synced X users & Y exports to Google Sheets"

### Important Notes
- Sync **overwrites** all existing data in the sheet (it's a full refresh, not incremental)
- The sync fetches ALL profiles and ALL export logs
- If the sheet has been deleted or the service account lost access, the sync will fail

---

## 12. COMMON ADMIN TASKS

### 🎯 Task: Give a Client More Exports
1. Go to `/admin`
2. **Users** tab → find the client by name
3. Click the **number** under "Max Exports" (e.g., "10")
4. Type the new number (e.g., "50")
5. Click ✓
6. Done! Client can export immediately.

### 🎯 Task: Switch a Client to Monthly Access
1. **Users** tab → find the client
2. Click the **badge** under "Access Mode" (e.g., "By Exports")
3. Select **"By Days"** from the dropdown
4. A date picker appears — set the expiry date (e.g., 30 days from today)
5. Click ✓
6. Done! Client has unlimited exports until that date.

### 🎯 Task: Block a Suspicious User
1. **Users** tab → find the user
2. Click the red **Block** button
3. They're immediately blocked from all exports
4. Optionally: go to **Devices** tab and block their device too

### 🎯 Task: Unblock a User After Payment
1. **Users** tab → find the blocked user (red "Blocked" badge)
2. Click **Unblock**
3. Optionally increase their max exports or change access mode

### 🎯 Task: Block a Device (Abuse Prevention)
1. **Devices** tab → find the device (high export count or suspicious activity)
2. Click the red **Block** button
3. That device can no longer export from ANY account

### 🎯 Task: Check Why a User Can't Export
1. **Users** tab → check:
   - Is "Status" = Blocked? → Unblock them
   - Is their export count ≥ Max Exports? → Increase the limit
   - Is their expiry date in the past? → Extend it
2. **Devices** tab → check:
   - Is their device blocked? → Unblock it
   - Is device export_count ≥ 15? → This is the hard device limit

### 🎯 Task: Add a New Admin User
This requires Lovable Cloud access:
1. Have the person sign up on the tool first
2. Note their User ID from the admin Users tab
3. In Lovable Cloud, insert a row in `user_roles` table:
   - `user_id` = their UUID
   - `role` = `admin`

---

## 13. TROUBLESHOOTING

### Problem: Admin page shows "Access Denied"
**Cause**: You're not logged in with the admin account, or the admin role is missing
**Fix**: 
- Make sure you're logged in as `techbharatstudios@gmail.com`
- If still failing, verify the `user_roles` table has an `admin` entry for your user_id

### Problem: Admin page shows infinite spinner
**Cause**: Authentication state is loading
**Fix**: 
- Try refreshing the page
- Try logging out and logging back in
- Check browser console (F12) for errors

### Problem: User says "I can't download" but they shouldn't be blocked
**Diagnosis steps**:
1. Check **Admin → Users** — is their status "Active"? Are they within export limits?
2. Check **Admin → Devices** — is their device blocked or at 15 exports?
3. Ask the user to try a different browser (this creates a new device fingerprint)

### Problem: Google Sheets sync fails
**Possible causes**:
- Service account credentials expired → Need to regenerate in Google Cloud Console
- Sheet was deleted or access revoked → Create new sheet and update `GOOGLE_SHEET_ID` secret
- Edge function error → Check the function logs in Lovable Cloud

### Problem: User can't sign up / verify email
**Possible causes**:
- Verification email went to spam folder
- Invalid email address
- User already has an account (try "Login" instead of "Sign Up")

### Problem: Excel file doesn't parse correctly
**Possible causes**:
- File format is not .xlsx or .xls (CSV won't work)
- Header row is not in the expected position (tool checks first 20 rows)
- Column names don't match any known patterns
**Fix**: Tell the user to make sure their file has clear column headers like "GSTIN", "Invoice No", "Date", etc.

### Problem: Reconciliation shows everything as "Not Matched"
**Possible causes**:
- GSTIN format differs between files (e.g., spaces, dashes)
- Invoice numbers are formatted differently
- The tool couldn't find the right columns — check the column mapping screen
**Fix**: The tool normalizes GSTINs (removes spaces/special chars), but wildly different formats may not match. Ask users to verify their column mapping in Step 2.

### Problem: Published site is down
**Fix**: Go to Lovable → click "Publish" → "Update" to redeploy

### Problem: Something broke after editing code
**Fix**: In Lovable, you can restore to a previous version using the version history

---

## 14. IF YOU WANT TO CHANGE SOMETHING

### Change contact details (email/WhatsApp)
Edit these files:
- `src/components/ContactPaywall.tsx` — line 27 (email) and line 34 (WhatsApp number)
- `src/components/Footer.tsx` — lines 24-29

### Change the default free export limit (currently 10)
The default is set in the **database** — the `profiles` table has `max_exports` defaulting to 10. To change it, you'd need a database migration to alter the default value.

### Change the device export limit (currently 15)
This is set in the database function `can_device_export()`. The number `15` is hardcoded there.

### Change colors/branding
Edit `src/index.css` — the `:root` section has all color variables in HSL format.

### Change the tool title or branding text
- `src/components/Navbar.tsx` — "TechBharat Studios" and "GST Reconciliation & Audit Tool"
- `src/components/Footer.tsx` — "Built by TechBharat Studios"
- `src/pages/Auth.tsx` — "GST Reconciliation & Audit Tool" and "by TechBharat Studios"

### Add a new reconciliation option
This would require editing:
- `src/pages/Tool.tsx` — add a new option card and flow
- `src/lib/gst-parsers.ts` — add parsing logic for the new file format
- `src/lib/gst-reconcile.ts` — add reconciliation logic
- `src/lib/gst-downloads.ts` — add Excel report generation

---

## 15. HANDOVER CHECKLIST

If you're giving this system to someone new, make sure they have:

### ✅ Access
- [ ] **Lovable account** with access to this project
- [ ] **Admin login credentials**: techbharatstudios@gmail.com (or create a new admin)
- [ ] **Google Cloud Console access** (for the service account that syncs to Sheets)
- [ ] **Google Sheet access** — Sheet ID: `1lWsCfU5scNRHyWutQlUosI1xzvGA0BOlo5kgMMtehFM`

### ✅ Knowledge
- [ ] Read this entire document (COMPLETE_SYSTEM_GUIDE.md)
- [ ] Read ADMIN_GUIDE.md for quick reference
- [ ] Understand the business model (10 free exports → contact to buy more)
- [ ] Know how to use the Admin dashboard at `/admin`

### ✅ Credentials & Secrets (stored in Lovable Cloud)
- [ ] `GOOGLE_SHEET_ID` — Google Sheet for data sync
- [ ] `GOOGLE_CLIENT_EMAIL` — Service account email
- [ ] `GOOGLE_PRIVATE_KEY` — Service account private key
- [ ] All other secrets are auto-managed by Lovable Cloud

### ✅ URLs
- [ ] **Published app**: https://gstr2b3breconciliation.lovable.app
- [ ] **Admin panel**: https://gstr2b3breconciliation.lovable.app/admin
- [ ] **Auth page**: https://gstr2b3breconciliation.lovable.app/auth

### ✅ Contact Points
- **WhatsApp for business inquiries**: +91 8668606224
- **Email**: techbharatstudios@gmail.com

---

## 16. TECHNICAL REFERENCE (For a Developer)

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **UI Components**: shadcn/ui (Radix UI primitives)
- **State Management**: React hooks (useState, useEffect, useCallback)
- **Routing**: React Router v6
- **Excel Processing**: xlsx-js-style (client-side, no server involved)
- **Backend**: Lovable Cloud (Supabase) — PostgreSQL database + Edge Functions (Deno)
- **Authentication**: Supabase Auth with email+password and Google OAuth
- **Hosting**: Lovable (automatic deployment on publish)

### Key Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.3.1 | UI framework |
| `react-router-dom` | ^6.30.1 | Page routing |
| `@supabase/supabase-js` | ^2.98.0 | Backend client |
| `xlsx-js-style` | ^1.2.0 | Excel read/write with styling |
| `sonner` | ^1.7.4 | Toast notifications |
| `lucide-react` | ^0.462.0 | Icons |
| `@tanstack/react-query` | ^5.83.0 | Data fetching (available but not heavily used) |
| `@lovable.dev/cloud-auth-js` | ^0.0.3 | Lovable Cloud auth integration |

### Database Schema (SQL Reference)

```sql
-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,  -- references auth.users(id)
  full_name TEXT,
  phone TEXT,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  max_exports INTEGER NOT NULL DEFAULT 10,
  access_mode TEXT NOT NULL DEFAULT 'exports',
  access_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Export logs
CREATE TABLE export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  export_type TEXT NOT NULL,
  device_fingerprint TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Device fingerprints
CREATE TABLE device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_id UUID,
  export_count INTEGER NOT NULL DEFAULT 0,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- User roles
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Role enum
CREATE TYPE app_role AS ENUM ('admin', 'moderator', 'user');
```

### RLS Policies Summary
| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | Own only | Own only | Own only | ❌ |
| export_logs | Own only | Own only | ❌ | ❌ |
| device_fingerprints | Own only | ❌ | ❌ | ❌ |
| user_roles | Admins only | ❌ | ❌ | ❌ |

### Environment Variables (in .env, auto-generated)
- `VITE_SUPABASE_URL` — Backend API URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Public API key
- `VITE_SUPABASE_PROJECT_ID` — Project identifier

### Edge Function Secrets (in Lovable Cloud)
All listed in Section 10 above.

---

## 🎯 QUICK REFERENCE CARD

| I want to... | Go to... | Do this... |
|-------------|---------|-----------|
| See all users | `/admin` → Users tab | Scroll through the table |
| Block a user | `/admin` → Users tab | Click red "Block" button |
| Give more exports | `/admin` → Users tab | Click the number, type new one, press ✓ |
| Give monthly access | `/admin` → Users tab | Click mode badge → "By Days" → set date → ✓ |
| Block a device | `/admin` → Devices tab | Click red "Block" button |
| See export history | `/admin` → Exports tab | Scroll through the table |
| Sync to Google Sheets | `/admin` | Click "Sync to Sheets" in top bar |
| Check published site | Browser | Visit https://gstr2b3breconciliation.lovable.app |
| Update the published site | Lovable | Click "Publish" → "Update" |

---

*Built with ❤️ by TechBharat Studios using Lovable*
*This document was created in March 2026 and should be updated when significant changes are made to the system.*
