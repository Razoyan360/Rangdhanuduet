# 🚀 Rangdhanu Turso Migration - Work Tree

This document tracks the progress of the migration from Google Apps Script to Node.js + Turso. 
You can use this file to continue work in any AI assistant (Antigravity, Claude Code, Cursor, etc.). All completed tasks will be marked with `[x]`.

## 📌 Phase 1: Preparation & Planning
- [x] Analyze frontend data structures and API endpoints.
- [x] Receive Google Sheets data export from the user (Excel/CSV).
- [ ] Map all Sheet columns to exact SQL schema definitions.

## 🗄️ Phase 2: Local Database Setup (LibSQL/SQLite)
- [x] Initialize local SQLite database file (`local.db`).
- [x] Write `backend/schema.sql` (Alumni, BloodBank, Events, Committee, Notices, etc.).
- [ ] Create a seed script (`seed.js`) to import data from the downloaded Sheet into the local database.
- [ ] Verify local database data integrity.

## ⚙️ Phase 3: Node.js Backend API Development
- [x] Setup Express server structure, CORS, and basic error handling.
- [ ] Implement Google Auth verification middleware (`google-auth-library`).
- [x] API: `alumni`, `memberprofile`, `membersaveprofile`, `registrations`
- [x] API: `bloodbank`
- [x] API: `events`, `eventgallery`
- [x] API: `executivecommittee`, `faculty`
- [x] API: `notices`, `socialposts`, `slideshow`
- [x] API: `pdacc` (stats, lines, updates)
- [x] API: `polls`
- [x] API: Admin endpoints (stats, activity, approvals)
- [x] **Implement Automated Tasks (Cron Jobs)**: Replace Apps Script time triggers for automated role shifts and system maintenance.

## 🌐 Phase 4: Frontend Integration & Testing (Offline)
- [x] Update `frontend/script.js` `API_BASE_URL` to point to `http://localhost:3000/api`.
- [ ] Test frontend fetching logic and fix any payload/response mismatches.
- [ ] Test Google Authentication flow locally.
- [ ] Verify all UI components render identically.

## ☁️ Phase 5: Production Deployment
- [ ] Create Turso account and provision production database.
- [ ] Sync local database to Turso cloud.
- [ ] Deploy Node.js backend (Vercel/Render).
- [ ] Update frontend `API_BASE_URL` to the production backend URL.
- [ ] Final end-to-end testing.
