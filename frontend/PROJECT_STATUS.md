# Rangdhanu DUET Project Status

This file is the handoff record for future agents. Read it before changing
authentication, member profiles, committee submissions, or the Apps Script
backend.

## Repository and deployment

- Frontend: static GitHub Pages site (`index.html`, `script.js`, `custom.css`).
- Backend: Google Apps Script files under `backend/` and `apps-script-live/`.
- Repository: `razoyan420/Rangdhanu-`.
- Main branch includes instant login profile cache and committee-directory integration.
- The live page cache version is `script.js?v=20260916-1630`.
- Backend deployment: `@83` on deployment ID `AKfycbwqgtu08WwoL4Yfz7o1AOXOx7M2OaezESIUqxpmkaFSB-iRniPiuAd8MsaVkGfqr_U5`.
- Login latency solved via stale-while-revalidate caching (`rd_member_profile` in `localStorage`), enabling 0-second instant profile rendering on page refresh while silent verification runs in the background.
- Profile edit mode includes a committee upgrade checkbox ("আপনি কি এই তথ্যটি কমিটি সেকশনেও যুক্ত/আপডেট করতে চান?"), which submits the designation to admin review.
- Approved committee submissions automatically link to existing Directory (Alumni) member profiles (`Positions` array & former positions) or create `UP-####` Unclaimed Profiles if not yet in the Directory.
- Membership applications matching 3-of-4 fields (Name, Series, Department, Mobile) against open unclaimed profiles are detected, flagged in Admin Notes, and shown in the Admin Dashboard ("Possible Matches" queue), enabling one-click merging into the verified Alumni profile with an immutable audit trail.
- Phase 1 of the unclaimed-record model was deployed to Apps Script on
  2026-09-14. It creates the `Unclaimed_Profiles` sheet on first use and
  exposes an admin-only `adminunclaimedprofiles` endpoint.
- Phase 2 was deployed to Apps Script on 2026-09-14. Membership applications
  now compare normalized Name, Series, Department, and Mobile against open
  unclaimed records. Three or four matches create a pending `Unclaimed_Matches`
  row; no automatic merge occurs.
- The live Apps Script web-app deployment was updated to version `@64` after
  the admin panel initially showed `Invalid API action` from the old `@63`
  deployment. The `adminunclaimedmatches` action now reaches the live backend
  (an unauthenticated probe correctly returns an authentication error rather
  than an invalid-action error).
- The merge-linking phase was deployed to the same web app as `@67`. The live
  `adminunclaimedaudits` route was probed without credentials and correctly
  returned an authentication error.
- A safe legacy backfill route was deployed to the same web app as `@69`.
  Admins can preview and then apply migration for older approved
  `Another member` committee entries. Candidate Alumni matches are shown for
  review; the admin explicitly chooses link, create an unclaimed profile, or
  skip for each record.
- The legacy backfill POST route was corrected and redeployed as `@71` after
  the first UI attempt returned `Invalid POST action`. An unauthenticated live
  POST now correctly reaches admin authorization and returns
  `Authenticated user could not be identified`.
- Per-record migration decisions (link to Alumni, create unclaimed, or skip)
  were deployed as `@76`. The preview now shows candidate profile details and
  the apply request sends an explicit decision map; no record is changed
  unless its decision is selected.
- The earlier unclaimed queue reconciliation experiment was superseded by
  `@81`. Loading the admin queue is now read-only again; it never silently
  marks a row `MERGED`. A row becomes `MERGED` only through an explicit
  reviewed merge/link action.
- The legacy review fix was deployed as `@78`. Existing `OPEN` unclaimed rows
  are now included in the review preview instead of being incorrectly
  reported as already handled. The same Link/Create/Skip decision flow can
  now resolve those five previously created rows.
- The public unclaimed-directory behavior was deployed as `@80`, and the
  series classification correction was deployed as `@81`. Admin-created
  `OPEN` and `KEPT_SEPARATE` unclaimed records now appear in the public Alumni
  feed as short profiles using `UP-####` IDs. Mobile, email, submitter, and
  other private/admin fields are not exposed. `MERGED` records are excluded
  because their committee history belongs to the verified Alumni profile.

## Completed and live-tested

### Member authentication

- Google Identity Services member sign-in.
- Member token persisted in `localStorage` under `rd_member_token`.
- Session restoration after refresh/revisit and silent renewal attempts.
- Logout removes the saved member session.
- Navigation `My Profile` dropdown contains Profile, Update profile, and Log
  out.
- Profile and update-profile flows are connected to the authenticated member
  session.
- A real member session was used to verify the live authenticated flow.

### Committee submission

- Committee submission is gated at the main CTA: signed-out users are sent to
  member sign-in; signed-in users can open the form.
- Form modes: `My information` and `Another member`.
- Existing member search and autofill.
- Own-member private contacts can populate mobile and email.
- Committee, session, position, department, series, mobile, email, message,
  and optional photo fields are supported.
- Submission records store `Submitted By`, `Submission Mode`, and
  `Target Member ID`.
- The frontend now sends `memberToken` with authenticated POST requests. This
  fixed the live error where the form opened but submission said
  "Please sign in before submitting committee information."
- Backend still validates the member token; do not bypass this check.
- Admin approval workflow is present. Approved entries appear on the public
  Committee page.

### Committee photos and privacy

- Optional JPG, PNG, and WEBP committee photos are uploaded as base64 to Apps
  Script.
- Photos are saved in Google Drive under the committee photo folder, in an
  entry-specific subfolder.
- The resulting photo URL is stored in the committee sheet and displayed
  after approval.
- Public responses omit private mobile/email data.
- Authenticated member responses can receive permitted private contacts.
- Committee redesign, committee/session tabs, leader/member cards, and
  profile/message actions are implemented.

## Partially implemented: unclaimed profile and manual merge model

The following requested model is still pending. Do not claim that it exists
until it is implemented and live-tested:

1. **Implemented:** When one member submits another person's committee
   information and an admin approves it, create one distinct `UP-####`
   unclaimed record linked to the source committee entry.
2. Keep the submitter only as internal `Submitted By`; never make the submitter
   the profile owner.
3. **Implemented:** When the named person later submits a membership
   application, normalize and compare Name, Series, Department, and Mobile.
4. **Implemented:** Flag a possible match when any 3 of those 4 fields match
   exactly after normalization.
5. Show an admin notification containing the old and new records, including
   conflicts.
6. Require an explicit admin choice: `Merge records` or `Keep separate`.
7. On merge, use the latest verified membership application for personal
   fields (name, series, department, mobile, photo, email, bio/contact data).
8. Preserve approved committee history, messages, sessions, positions, and
   original submission references.
9. Detect duplicate committee entries and send conflicts to admin review
   instead of silently duplicating or deleting data.
10. Keep an audit record of who merged, when, which records were merged, and
    the pre-merge values.
11. Provide a safe undo path for an erroneous merge.
12. Add admin UI and backend routes for match review, merge, keep-separate,
    audit, and undo.

The unclaimed record and 3-of-4 matching phases are live in Apps Script. The
admin panel now has `Unclaimed Profiles` and `Possible Matches` tabs, with
`Merge records` and `Keep separate` actions. The Possible Matches review now
shows old committee values beside new membership values and flags field
conflicts. Merge is allowed only after the membership application is approved;
verified registration data is the Alumni profile source, and approved
committee history is linked into Alumni with source-entry IDs and duplicate
checks. A dedicated `Unclaimed_Merge_Audit` sheet stores admin identity,
timestamps, both source IDs, complete pre-merge snapshots, and post-merge
values. The Merge Audit tab exposes a guarded undo path that refuses to
overwrite later edits and restores the pre-merge values while leaving the
original committee entry intact.

The live backend implementation has not yet been owner-tested with a
controlled real/test record. The owner must verify approved other-person
committee entry -> unclaimed row -> approved matching membership -> side-by-
side review -> merge, duplicate/conflict behavior, keep-separate, and safe
undo before this workflow is considered fully live-tested.

The admin `Unclaimed Profiles` tab now includes `Scan older approved committee
records`. It performs a dry-run preview first and requires explicit
confirmation before creating unclaimed rows or linking exact Alumni matches.
- The owner live-tested the Possible Matches tab after deployment `@64`; it
  loaded successfully and showed “No possible matches yet”.

## Validation already performed

- `node --check script.js` passed after the merge review UI changes.
- `node --check` passed for `backend/Unclaimed_Merge.js`, `backend/Code.js`,
  `backend/Registration_API.js`, and `backend/Executive Comittee.js`.
- `git diff --check` passed.
- Live sign-in, profile display, committee form opening, another-member
  autofill, authenticated submission, admin approval, and Drive photo
  visibility were verified in a browser.
- Apps Script push and deployment to the existing web app completed at `@78`.
- A live unauthenticated request to `adminunclaimedaudits` returned
  `Authenticated user could not be identified`, confirming the route is
  deployed and protected.
- No production/test merge record was created by the agent. Real-data
  end-to-end merge, conflict, and undo behavior remains owner-tested work.
- Legacy backfill has not been applied by the agent; the owner must review the
  dry-run counts before confirming the migration.
- The reconciliation code was syntax-checked and deployed, but the owner still
  needs to reload the live Admin Dashboard and confirm linked rows leave the
  open Unclaimed queue while genuinely unmatched rows remain.
- The live public `alumni` endpoint was checked after `@80`: it returned
  unclaimed IDs `UP-0001`, `UP-0002`, and `UP-0003` as public short profiles.
- The live public `alumni` endpoint was checked after `@81`: `UP-0001` and
  `UP-0002` are `Alumni` under the current cutoff, while `UP-0003` is
  correctly `Running Member` because its Series is 23.
- Deployment `@82` restores legacy review for previously created rows that
  were incorrectly marked `MERGED` by the superseded reconciliation
  experiment. Such rows can again show their Directory candidate and be
  explicitly linked; only an intentional `KEPT_SEPARATE` decision is excluded
  from that review.

## Important implementation notes

- Keep public/private contact boundaries intact.
- Keep `memberToken` separate from `adminToken`.
- Do not make a committee submitter the owner of another person's profile.
- Do not automatically merge records, even if three fields match.
- Preserve user changes already present in the worktree; inspect status before
  editing.
- After frontend changes, update the `script.js?v=...` cache-busting version.
- After backend changes, deploy the Apps Script web app and verify the live
  endpoint, not only local source.
