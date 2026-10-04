# Rangdhanu DUET — Handover Prompt

You are taking over the Rangdhanu DUET project. Read
`PROJECT_STATUS.md` first. Do not assume that a feature is complete merely
because its UI exists: distinguish source-code work, backend deployment, agent
verification, and user live verification.

## Product requirements from the owner

The owner wants:

1. A GitHub Pages frontend, Google Apps Script backend, Google Sheets data, and
   Google Drive image storage to work together reliably.
2. Google member sign-in to persist across refreshes and revisits until the
   member logs out, with silent renewal where possible.
3. A clear navigation-level My Profile dropdown containing Profile, Update
   profile, and Log out.
4. Committee submission to check login when the main submission button is
   pressed. Signed-out visitors should be sent to sign-in; signed-in members
   should get the form without a second confusing client-side login gate.
5. Committee submission modes for the signed-in member and for another person.
   Other-person submissions must not make the submitter the other person's
   profile owner.
6. Committee submission must support member search/autofill, mobile/email,
   optional photo, committee/session/position, message, approval, and privacy.
7. Public visitors must not see private mobile/email data; permitted signed-in
   members may see it.
8. The final identity model is:
   - Another person submits a committee record.
   - Admin approval creates an unclaimed record, not an account and not an
     owner relationship with the submitter.
   - A later membership application is compared by normalized Name, Series,
     Department, and Mobile.
   - Any 3 of 4 matches create an admin review item.
   - No automatic merge.
   - Admin chooses Merge records or Keep separate.
   - Verified membership data becomes the personal profile source while
     approved committee history is retained.
   - Conflicts, duplicates, audit, and undo must be handled safely.

## Confirmed completed and live-tested by the agent

- Google Identity Services member authentication exists.
- Member token persistence uses `localStorage` key `rd_member_token`.
- Refresh/session restore, logout handling, and navigation repainting exist.
- My Profile navigation dropdown exists with Profile, Update profile, and Log
  out.
- Committee CTA login gate exists.
- Committee form supports My information and Another member modes.
- Existing-member search/autofill and private contact merging exist.
- Frontend sends `memberToken` on authenticated POST requests.
- Backend validates the member token; do not bypass this validation.
- Committee records preserve Submitted By, Submission Mode, and Target Member
  ID.
- Committee approval workflow exists.
- Committee photos are compressed, uploaded to Google Drive, stored under an
  entry-specific folder, and linked from the committee sheet.
- Public/private committee contact behavior exists.
- Committee redesign, session tabs, leader/member cards, profile/message
  actions, and multiple committee support exist.
- An Apps Script deployment was updated to live version `@64`.
- The live `adminunclaimedmatches` endpoint was probed without credentials and
  correctly returned an authentication error instead of Invalid API action.
- `node --check script.js` and `git diff --check` passed during the latest
  changes.

## Confirmed completed and live-tested by the owner

The owner used a real member account and confirmed:

- Google sign-in works in a normal browser.
- My Profile and the member profile appear after sign-in.
- Committee submission form opens while signed in.
- Another member search/autofill flow was visible and usable.
- Committee submission succeeded.
- Uploaded committee image became visible after approval.
- Approved committee entry appeared on the public Committee page.
- Admin panel now shows the Unclaimed Profiles and Possible Matches tabs.
- After the deployment correction, Possible Matches loads and displays:
  “No possible matches yet” instead of Invalid API action.

## Implemented but not owner-tested end-to-end

- Creation of `Unclaimed_Profiles` on approval of an approved
  `Another member` committee entry.
- Source committee entry linkage and `UP-####` IDs.
- Duplicate prevention for the same source committee entry.
- Creation of `Unclaimed_Matches` when normalized 3-of-4 fields match.
- Admin-only `adminunclaimedprofiles` and `adminunclaimedmatches` endpoints.
- Possible Matches UI actions: Merge records and Keep separate.
- Merge is blocked unless the membership registration is APPROVED.
- Merge retains the unclaimed record and writes a basic Activity_Log entry.

These paths need a controlled test with a non-production/test record before
claiming full success. Do not create fake production records without the
owner's approval.

## Implemented in the latest merge-linking phase; owner test still required

1. Show old and new record details side by side in the match review UI,
   including all conflicts. **Implemented; owner review still required.**
2. Make merge update/link the profile data in the real Alumni/member data
   model, not only mark the unclaimed record with a registration ID.
   **Implemented; owner test still required.**
3. Preserve and deduplicate all committee history during merge.
   **Implemented with source-entry IDs and duplicate blocking; owner test still
   required.**
4. Detect duplicate committee history conflicts and route them to review.
   **Implemented with `CONFLICT_REVIEW`; owner test still required.**
5. Add a complete merge audit record containing:
   - admin identity
   - timestamp
   - both source record IDs
   - complete pre-merge values
   - post-merge result
   **Implemented in `Unclaimed_Merge_Audit`; owner test still required.**
6. Implement safe undo/rollback for a merge without deleting source history.
   **Implemented with post-merge change detection; owner test still required.**
7. Add explicit review status transitions and robust authorization checks for
   merge, keep-separate, and undo. **Implemented for merge, keep-separate,
   conflict review, and undo.**
8. Run a controlled end-to-end test:
   approved other-person committee record -> unclaimed row -> matching
   membership application -> admin review -> keep separate or merge -> audit.
9. Verify the Apps Script deployment after every backend change; `clasp push`
   alone is not enough. The live web-app deployment was updated to `@67`.
10. Update `PROJECT_STATUS.md` after each verified phase.

## Important deployment details

- Repository: `razoyan420/Rangdhanu-`.
- Frontend files are tracked at repository root.
- Apps Script source is under `backend/`.
- `.gitignore` intentionally ignores backend files; deploy backend with clasp.
- `.clasp.json` points to the Apps Script project.
- Frontend cache-busting script version is in `index.html`; update it after
  frontend changes.
- Current Apps Script web-app deployment used by the frontend is the deployment
  whose URL is in `script.js` as `API_BASE_URL`; it was updated to `@67`.
- Use the existing repository/worktree changes; do not reset or discard user
  changes.

## First actions for the next agent

1. Read `PROJECT_STATUS.md` and this file.
2. Inspect `git status`, current branch, and latest commit.
3. Do not redo authentication or committee work already marked complete.
4. Inspect `backend/Unclaimed_Merge.js`, `Registration_API.js`,
   `Executive Comittee.js`, `Code.js`, and the admin renderer in `script.js`.
5. Finish the incomplete merge data-linking, conflict handling, audit, and undo
   work one phase at a time.
6. Validate syntax, deploy Apps Script, publish frontend, and report exactly
   what was agent-tested versus what the owner must test.
