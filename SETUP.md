# Setup: content calendar + LinkedIn feed + 3x/week email cadence

This repo has three parts:

- `dashboard/index.html` — the dashboard (calendar + LinkedIn feed), already live at
  https://nonsibi-dashboard.netlify.app/. Backed by Supabase (`groups`, `people`, `calendar` tables).
- `supabase/schema.sql` — creates/extends the `calendar` table the dashboard reads live via
  Supabase realtime.
- `apps-script/` — a Google Apps Script project, bound to the master Google Sheet
  (https://docs.google.com/spreadsheets/d/1hzvFhNAaScWUB7aQnr3-9juucc5L4ZPwQPXdUGSdElE), that:
  1. Syncs the **Calendar** tab into Supabase so the dashboard's calendar view stays live.
  2. Sends the 3x/week email cadence (Thu 3pm, Mon 8am, Wed reminder, all America/Chicago).

Apps Script runs entirely on Google's servers — once installed, it keeps working whether or
not this Claude session (or any browser tab) is open.

## 1. Run the Supabase SQL once

1. Open the Supabase project dashboard for `https://mlrfmahsmjwtcozlxlyo.supabase.co`.
2. SQL Editor → New query → paste the contents of `supabase/schema.sql` → Run.
3. While you're there, grab the **service_role** secret: Project Settings → API → `service_role`
   (the long secret key, *not* the `anon`/`publishable` one already in the dashboard HTML).
   Keep this out of chat and out of the sheet — it's a full-access key. You'll paste it directly
   into Apps Script in step 3.

## 2. Add the Apps Script project to the Sheet

1. Open the master Google Sheet → **Extensions → Apps Script**.
2. Delete the default empty `Code.gs`.
3. For each file in `apps-script/` (`Config.gs`, `Sync.gs`, `Emails.gs`, `Triggers.gs`), create a
   matching file in the Apps Script editor (File → New → Script file) and paste its contents.
4. For `appsscript.json`: click the gear icon (Project Settings) → check "Show `appsscript.json`
   manifest file in editor" → open it from the file list → replace its contents with
   `apps-script/appsscript.json`.

## 3. Add the Supabase key as a Script Property

1. In the Apps Script editor: gear icon (Project Settings) → Script Properties → Add script
   property.
2. Property: `SUPABASE_SERVICE_KEY`, Value: the `service_role` secret from step 1.
3. Save. This keeps the key out of source entirely — the code reads it via
   `PropertiesService`.

## 4. Install the triggers (one-time)

1. In the function dropdown at the top of the editor, select `installTriggers`, click **Run**.
2. Google will prompt for authorization the first time (it needs to read the Sheet, send email
   as you, and make external requests to Supabase) — review and allow it.
3. Check Triggers (clock icon, left sidebar) — you should see 5 triggers: an on-edit sync, a
   15-minute backstop sync, and the three weekly email jobs.

## 5. Test before trusting the schedule

From the function dropdown, run each of these manually once and confirm the result:

- `syncCalendarToSupabase` — then reload the dashboard and confirm calendar cards show up.
- `sendThursdayPreview` / `sendMondayReview` — sends real email to the whole team right away,
  so do this when you're ready for that.
- `sendWednesdayReminder` — only sends anything if a post is dated today and isn't Live yet.

## Notes / things you may want to adjust

- **Team roster**: edit the `TEAM` map at the top of `Config.gs` to add/remove people. Matching
  is by first name, case-insensitive, against the "Posting from" column.
- **Boss / cc**: `BOSS_EMAIL` in `Config.gs` (currently `lucy@nonsibi.vc`).
- **Wednesday reminder time**: picked 4:00 PM CDT (giving all day Wednesday to post before
  nudging) — change the `atHour(16)` in `Triggers.gs` if you'd rather it fire earlier/later.
- **"Posted" detection**: a row counts as live once its Status is "Live" *and* its link column
  contains a real `linkedin.com` URL — matching the same check the dashboard itself uses.
- **calendar table is read-only from the browser**: only the Apps Script sync (via the
  service_role key) can write to it; `groups`/`people` keep their existing behavior (writable
  from the dashboard UI, as they already were).
- **Redeploying the dashboard**: `dashboard/index.html` in this repo is unchanged from what's
  live on Netlify today — it's committed here just for version control. If you want Netlify to
  auto-deploy from this repo/branch going forward instead of a manual drag-and-drop, that's a
  one-time change in the Netlify site settings (Site configuration → Build & deploy → Link
  repository) — say the word if you'd like help wiring that up.
