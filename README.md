# 📊 AMZ Prep — Pricing Request Tracker

A fully automated pricing request management system built on **Google Apps Script**, **Gmail**, **Google Sheets**, and a **live GitHub Pages dashboard**. Tracks every inbound pricing request from first email to resolution, with SLA nudges, response time analytics, and a real-time web dashboard.

---

## 🗂 What's in this repo

| File | Description |
|------|-------------|
| `index.html` | Live dashboard — reads from Google Sheets, no backend required |
| `gmail_daily_digest.gs` | Main Apps Script — runs all automation |
| `bulkResolve.gs` | One-time script — backfills historical pricing requests |
| `backfillRequestedBy.gs` | One-time script — populates "Requested By" column for existing rows |

---

## 🚀 How it works

### 1. Gmail auto-labeling
Any email with **"Pricing Request"** in the subject is automatically:
- Labeled `💰 Pricing Request` in Gmail
- Logged to the **Google Sheet** with client name, received date, subject, and sender
- Tracked against its SLA rule

### 2. SLA nudges
The script checks for overdue requests every 2 hours **(Mon–Fri, 9AM–5PM only)** and sends nudge emails to the team when SLAs are breached.

| Subject contains | SLA |
|---|---|
| Pricing Request - Fulfilment | 8 hours |
| Pricing Request - Shipping | 16 hours |
| Pricing Request - Combined | 16 hours |
| Any other Pricing Request | 8 hours (default) |

Each nudge email includes a **"Mark as Resolved"** button that:
- Applies the `✅ Resolved` label in Gmail
- Logs the resolved timestamp to the sheet
- Stops all future nudges for that thread

### 3. Auto-resolve
Any pricing request thread with **no activity for 6.5+ days** is automatically marked resolved, with response time calculated from the first to last message in the thread.

### 4. Auto-reopen
If a resolved thread receives a **new reply**, it is automatically reopened — the `✅ Resolved` label is removed, `Need to Respond` is re-applied, and both team members receive a **🔄 Reopened** alert email.

### 5. Label sync
Every **30 minutes**, the script syncs Gmail label changes back to the Google Sheet, so manual label changes in Gmail are always reflected in the dashboard.

### 6. Morning digest
Every morning at **8AM**, a digest email is sent summarising all open pricing requests with their SLA badges and how long they've been open.

---

## 📊 Dashboard

**Live URL:** `https://abishek-oss.github.io/Gmail-dashboard`

The dashboard reads directly from the Google Sheet — no API keys or logins required. It auto-refreshes every **5 minutes**.

### Features
- **Overview tab** — stats, response time bar chart, status donut, and full request table
- **By Requester tab** — per-sender breakdown with total requests, avg/fastest/slowest response times, and SLA rate
- **Client search** — filter the entire dashboard by client name (highlights matches in table)
- **Date range filter** — filter by received date; all stats including avg response time pivot to the filtered range
- **Status filters** — On Time / Delayed / Overdue / Pending / Resolved
- **Sortable columns** — click any column header to sort ascending/descending

### Status definitions
| Status | Meaning |
|---|---|
| ✅ On Time | Replied within SLA window |
| ⚠️ Delayed | Replied between 4–24 hours |
| ❌ Overdue | Replied after 24+ hours |
| ⏳ Pending | No reply yet, within SLA |
| ✅ Resolved | Manually marked resolved |

---

## ⚙️ Setup

### Prerequisites
- Google account with Gmail and Google Drive access
- GitHub account (for hosting the dashboard)

### Step 1 — Deploy the Apps Script
1. Go to [script.google.com](https://script.google.com) → **New project**
2. Paste the contents of `gmail_daily_digest.gs` into `Code.gs`
3. Save the project (name it something like `AMZ Prep Pricing Tracker`)
4. Run `setupTriggers` once to create all three scheduled triggers:
   - `runMorningDigest` — daily at 8 AM
   - `checkForOverdueEmails` — every 2 hours
   - `syncLabelsToSheet` — every 30 minutes
5. Authorise Gmail and Drive permissions when prompted

### Step 2 — Deploy the Web App (for Mark as Resolved button)
1. In Apps Script → **Deploy → New deployment**
2. Select type: **Web app**
3. Set **Execute as:** Me | **Who has access:** Anyone
4. Click **Deploy** → copy the URL
5. Paste the URL into the `getWebAppUrl()` function in the script
6. Redeploy (Deploy → Manage deployments → edit → New version)

### Step 3 — Make the Google Sheet public
1. The script automatically creates a **"Pricing Response Tracker"** Google Sheet in your Drive the first time it runs
2. Open the sheet → **Share → Anyone with the link → Viewer**
3. Copy the Sheet ID from the URL: `docs.google.com/spreadsheets/d/`**`SHEET_ID`**`/edit`

### Step 4 — Deploy the dashboard to GitHub Pages
1. Upload `index.html` to your GitHub repo
2. Go to **Settings → Pages → Branch: main / (root)** → Save
3. Your dashboard will be live at `https://yourusername.github.io/reponame`
4. Open the dashboard — it will load automatically (Sheet ID is hardcoded)

### Step 5 — Backfill historical data (optional)
Run these one-time scripts in Apps Script to populate existing data:
- `backfillPricingRequests()` — imports historical pricing request emails into the sheet
- `backfillRequestedBy()` — fills in the "Requested By" column for existing rows
- `bulkResolveHistorical()` — marks old inactive threads as resolved with response times

---

## 📋 Google Sheet columns

| Column | Description |
|---|---|
| Thread ID | Unique Gmail thread identifier |
| Client | Extracted from email subject |
| Received | Date/time of first message |
| Subject | Full email subject |
| Gmail Link | Direct link to thread |
| Replied At | Date/time of first reply |
| Response Time (hrs) | Hours from first message to first reply |
| Status | On Time / Delayed / Overdue / Pending / Resolved |
| Resolved At | Date/time thread was marked resolved |
| Requested By | Name of person who sent the first email |

---

## 🏷 Gmail labels used

| Label | Purpose |
|---|---|
| `💰 Pricing Request` | Applied to all tracked pricing request threads |
| `Need to Respond` | Applied when a thread needs attention |
| `⏰ Follow Up Now` | Applied when a thread is past its SLA |
| `✅ Resolved` | Applied when a thread is marked resolved |

---

## 👥 Team

| Person | Role |
|---|---|
| Abishek Swaminathan | Primary responder (`abishek@amzprep.com`) |
| Gokulan Balakrishnan | Secondary responder (`goku@amzprep.com`) |

To add more team members, update the `RESPONDERS` and `NUDGE_RECIPIENTS` arrays at the top of `gmail_daily_digest.gs`.

---

## 🔧 Customisation

All key settings are at the top of `gmail_daily_digest.gs`:

```javascript
var DIGEST_HOUR     = 8;    // Morning digest send time (24h)
var NUDGE_INTERVAL  = 2;    // Hours between nudge checks
var WORK_START      = 9;    // Work day start (no nudges before this)
var WORK_END        = 17;   // Work day end (no nudges after this)
var ABANDON_DAYS    = 6.5;  // Days of inactivity before auto-resolve

var NUDGE_RULES = [
  { keyword: "pricing request - fulfilment", hours: 8  },
  { keyword: "pricing request - shipping",   hours: 16 },
  { keyword: "pricing request - combined",   hours: 16 },
  { keyword: "pricing request",              hours: 8  }  // catch-all
];
```

---

## 📦 Tech stack

- **Google Apps Script** — automation, Gmail API, Sheets API
- **Gmail** — email source and label management
- **Google Sheets** — data storage and sync layer
- **GitHub Pages** — static dashboard hosting
- **Chart.js** — dashboard charts and visualisations
- **Google Sheets CSV export API** — live data feed to dashboard (no auth required)
