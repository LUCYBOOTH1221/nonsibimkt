/**
 * non sibi marketing dashboard -- complete Apps Script.
 *
 * Works either as a standalone script project or bound to the Sheet
 * (Extensions > Apps Script) -- it opens the spreadsheet by ID either way.
 */

// ==========================================================================
// Config
// ==========================================================================

/**
 * Central config for the non sibi marketing dashboard automation.
 * To add/remove a teammate, edit the TEAM map -- everything else reads from it.
 */

// The master content calendar spreadsheet. Opening it by ID means this script
// works whether it lives inside the Sheet (Extensions > Apps Script) or as a
// standalone project at script.google.com.
const SHEET_ID = '1hzvFhNAaScWUB7aQnr3-9juucc5L4ZPwQPXdUGSdElE';

const SHEET_TAB_NAME = 'Calendar';

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

const SUPABASE_URL = 'https://mlrfmahsmjwtcozlxlyo.supabase.co';

// Service role key lives in Script Properties, never in this file or the sheet:
//   Apps Script editor > Project Settings (gear icon) > Script Properties
//   > add SUPABASE_SERVICE_KEY = <the service_role secret from Supabase
//   Project Settings > API>.
function getSupabaseServiceKey() {
  const key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_KEY script property -- see SETUP.md.');
  return key;
}

const DASHBOARD_URL = 'https://nonsibi-dashboard.netlify.app/';

const BOSS_EMAIL = 'lucy@nonsibi.vc';

// First-name (lowercase) -> email. "Posting from" cells often list multiple
// names and org names comma-separated (e.g. "Andrea, RAVA, non sibi"); only
// names found here resolve to an email, org names are ignored harmlessly.
const TEAM = {
  kent: 'kent@nonsibi.vc',
  camille: 'camille@nonsibi.vc',
  andrea: 'andrea@nonsibi.vc',
  auny: 'auny@nonsibi.vc',
  maria: 'maria@nonsibi.vc',
};

// Everyone who gets the Thursday/Monday full-plan email regardless of assignment.
const FULL_TEAM_LIST = Object.values(TEAM).concat([BOSS_EMAIL]);

function resolveAssigneeEmails(postingFromRaw) {
  const names = String(postingFromRaw || '').split(',').map(s => s.trim()).filter(Boolean);
  const emails = [];
  const unmatched = [];
  names.forEach(n => {
    const key = n.toLowerCase();
    if (TEAM[key]) emails.push(TEAM[key]);
    else unmatched.push(n);
  });
  return { emails: Array.from(new Set(emails)), unmatched };
}

// ==========================================================================
// Sync
// ==========================================================================

/**
 * Reads the "Calendar" tab and upserts every data row into Supabase's `calendar`
 * table (read by dashboard/index.html), then deletes any Supabase rows whose
 * sheet row no longer exists. Safe to run as often as needed -- it's a full
 * resync each time, keyed by sheet row number.
 */
function syncCalendarToSupabase() {
  const rows = readCalendarRows_();
  upsertCalendarRows_(rows);
  pruneDeletedRows_(rows.map(r => r.id));
  Logger.log('Synced ' + rows.length + ' calendar rows to Supabase.');
}

// Column layout of the "Calendar" tab (fixed across every monthly block, even
// though the header text itself varies slightly, e.g. "Link to copy" vs
// "Link to approved copy"):
//   A Target Go-Live | B Posting from | C Week of | D Publish date
//   E Theme | F Topic | G Working title | H CTA/Next step | I Channel
//   J Status | K Link to copy | L Repost To | M Notes
function readCalendarRows_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_TAB_NAME);
  if (!sheet) throw new Error('No "' + SHEET_TAB_NAME + '" tab found in this spreadsheet.');
  const values = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const rowNum = i + 1;
    const targetGoLive = r[0];
    // A data row has a real date in col A plus at least one of Posting
    // from/Theme/Topic/Working title/Status filled in -- this skips month-label
    // rows, header rows, the title banner, blank rows and stray lone dates.
    if (!(targetGoLive instanceof Date)) continue;
    const hasContent = [r[1], r[4], r[5], r[6], r[9]].some(v => v !== '' && v != null);
    if (!hasContent) continue;

    const publishDate = r[3] instanceof Date ? r[3] : null;
    const weekOf = r[2] instanceof Date ? r[2] : null;
    const effectiveDate = publishDate || targetGoLive;

    rows.push({
      id: 'row-' + rowNum,
      sort_date: formatDate_(effectiveDate),
      target_go_live: formatDate_(targetGoLive),
      publish_date: publishDate ? formatDate_(publishDate) : null,
      week_of: weekOf ? formatDate_(weekOf) : null,
      posting_from: str_(r[1]),
      theme: str_(r[4]),
      topic: str_(r[5]),
      working_title: str_(r[6]),
      cta: str_(r[7]),
      channel: str_(r[8]),
      status: str_(r[9]),
      link: str_(r[10]),
      repost_to: str_(r[11]),
      notes: str_(r[12]),
    });
  }
  return rows;
}

function str_(v) {
  if (v == null) return '';
  return String(v).trim();
}

function formatDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function upsertCalendarRows_(rows) {
  if (rows.length === 0) return;
  chunk_(rows, 200).forEach(part => {
    const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/calendar?on_conflict=id', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: getSupabaseServiceKey(),
        Authorization: 'Bearer ' + getSupabaseServiceKey(),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      payload: JSON.stringify(part),
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() >= 300) {
      throw new Error('Supabase upsert failed: ' + resp.getResponseCode() + ' ' + resp.getContentText());
    }
  });
}

function pruneDeletedRows_(validIds) {
  const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/calendar?select=id', {
    method: 'get',
    headers: {
      apikey: getSupabaseServiceKey(),
      Authorization: 'Bearer ' + getSupabaseServiceKey(),
    },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) return; // don't block the sync on a prune failure
  const existing = JSON.parse(resp.getContentText()).map(r => r.id);
  const validSet = new Set(validIds);
  const toDelete = existing.filter(id => !validSet.has(id));
  if (toDelete.length === 0) return;

  // Delete in small batches: every id goes into the query string, and Apps
  // Script caps a fetch URL at ~2 KB ("Limit Exceeded: URLFetch URL Length").
  // Ids are quoted so any comma/space in a stray id can't break the filter.
  chunk_(toDelete, 40).forEach(part => {
    const list = part.map(id => '"' + String(id).replace(/"/g, '') + '"').join(',');
    UrlFetchApp.fetch(
      SUPABASE_URL + '/rest/v1/calendar?id=in.(' + encodeURIComponent(list) + ')', {
        method: 'delete',
        headers: {
          apikey: getSupabaseServiceKey(),
          Authorization: 'Bearer ' + getSupabaseServiceKey(),
          Prefer: 'return=minimal',
        },
        muteHttpExceptions: true,
      });
  });
  Logger.log('Removed ' + toDelete.length + ' stale rows.');
}

function chunk_(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Fires on every edit to the sheet (installable trigger, see Triggers.gs) so
// the dashboard reflects a status/link change within seconds.
function onCalendarEdit(e) {
  syncCalendarToSupabase();
}

// ==========================================================================
// Emails
// ==========================================================================

/**
 * The 3x/week email cadence:
 *  - Thursday 3:00 PM CDT: preview of NEXT week's plan, sent to the whole
 *    team, calling out by name anyone whose assigned content isn't Live yet.
 *  - Monday 8:00 AM CDT (week of the post): same view for THIS week, resent
 *    to the whole team to review or discuss in the team meeting.
 *  - Wednesday 12:00 PM CDT reminder: for any post targeted to go live today,
 *    check whether it's actually posted (Live status + a real linkedin.com
 *    link). If not, nudge the assignee + the boss with a link to the dashboard.
 *
 * These are wired to time-driven triggers by installTriggers() in
 * Triggers.gs -- you shouldn't need to run them by hand except to test.
 */

function sendThursdayPreview() {
  sendWeeklyPlanEmail_(1, 'Next week on LinkedIn: ');
}

function sendMondayReview() {
  sendWeeklyPlanEmail_(0, 'This week on LinkedIn: ');
}

function sendWeeklyPlanEmail_(weekOffset, subjectPrefix) {
  const { start, end } = weekRange_(weekOffset);
  const rows = readCalendarRows_()
    .filter(r => inRange_(r.target_go_live, start, end))
    .sort((a, b) => (a.target_go_live || '').localeCompare(b.target_go_live || ''));

  const subject = subjectPrefix + start + ' to ' + end;

  if (rows.length === 0) {
    MailApp.sendEmail({
      to: FULL_TEAM_LIST.join(','),
      subject: subject,
      htmlBody: wrapEmail_('<p>Nothing is scheduled for this week yet on the ' +
        '<a href="' + DASHBOARD_URL + '">Calendar tab</a>. Add something, or mark it Hold/Idea if that\'s intentional.</p>'),
    });
    return;
  }

  const needsReview = rows.filter(r => !isLive_(r));
  const flaggedNames = new Set();
  needsReview.forEach(r => {
    String(r.posting_from || '').split(',').map(s => s.trim()).filter(Boolean).forEach(n => flaggedNames.add(n));
  });

  const rowsHtml = rows.map(r => renderRowHtml_(r)).join('');
  const flagHtml = needsReview.length
    ? '<p><b>Needs review before it goes out:</b> ' + Array.from(flaggedNames).map(escHtml_).join(', ') + '</p>'
    : '<p style="color:#2e8a48"><b>Everything for this week is already marked Live.</b></p>';

  const body = flagHtml +
    '<table style="border-collapse:collapse;width:100%;font-size:14px">' + rowsHtml + '</table>' +
    '<p style="margin-top:20px"><a href="' + DASHBOARD_URL + '">Open the full dashboard →</a></p>';

  // Whole team gets the plan.
  MailApp.sendEmail({
    to: FULL_TEAM_LIST.join(','),
    subject: subject,
    htmlBody: wrapEmail_(body),
  });

  // Anyone with something still not Live also gets a direct heads-up.
  needsReview.forEach(r => {
    const { emails } = resolveAssigneeEmails(r.posting_from);
    emails.forEach(email => {
      MailApp.sendEmail({
        to: email,
        subject: 'Please review: ' + (r.working_title || r.topic || 'your post') + ' (' + r.target_go_live + ')',
        htmlBody: wrapEmail_(
          '<p>This is assigned to you and is currently marked "<b>' + escHtml_(r.status || 'not started') +
          '</b>" for ' + r.target_go_live + '.</p>' +
          renderRowHtml_(r, true) +
          '<p style="margin-top:16px"><a href="' + DASHBOARD_URL + '">Open the dashboard →</a></p>'
        ),
      });
    });
  });
}

function sendWednesdayReminder() {
  const todayStr = formatDate_(new Date());
  const rows = readCalendarRows_().filter(r => r.target_go_live === todayStr);
  if (rows.length === 0) return; // nothing scheduled to air today

  rows.forEach(r => {
    if (isLive_(r)) return; // already posted, no reminder needed

    const title = r.working_title || r.topic || '(untitled post)';
    const { emails } = resolveAssigneeEmails(r.posting_from);

    if (emails.length === 0) {
      // No one on the team maps to this assignee -- still alert the boss so
      // it doesn't silently slip.
      MailApp.sendEmail({
        to: BOSS_EMAIL,
        subject: 'Unassigned reminder: "' + title + '" was due today with no matching team email',
        htmlBody: wrapEmail_(
          '<p>"' + escHtml_(title) + '" was targeted to go live today (' + todayStr + ') and doesn\'t have a ' +
          'live LinkedIn link yet. The sheet lists "' + escHtml_(r.posting_from) + '" as responsible, which ' +
          'didn\'t match anyone in the team list.</p>' +
          '<p><a href="' + DASHBOARD_URL + '">Check the dashboard →</a></p>'
        ),
      });
      return;
    }

    MailApp.sendEmail({
      to: emails.join(','),
      cc: BOSS_EMAIL,
      subject: 'Reminder: "' + title + '" was due to air today',
      htmlBody: wrapEmail_(
        '<p>This was targeted to go live today (' + todayStr + ') and doesn\'t have a live LinkedIn link in the ' +
        'sheet yet. Once it\'s posted, drop the link into the Calendar tab and the dashboard picks it up automatically.</p>' +
        renderRowHtml_(r, true) +
        '<p style="margin-top:16px"><a href="' + DASHBOARD_URL + '">Open the dashboard →</a></p>'
      ),
    });
  });
}

function isLive_(r) {
  return /linkedin\.com/i.test(r.link || '') && /live/i.test(r.status || '');
}

function renderRowHtml_(r, standalone) {
  const title = escHtml_(r.working_title || r.topic || '(untitled)');
  const statusColor = isLive_(r) ? '#2e8a48' : '#b07a1e';
  if (standalone) {
    return '<div style="margin:10px 0;padding:12px;border:1px solid #d8deea;border-radius:8px">' +
      '<div style="font-weight:600">' + title + '</div>' +
      '<div style="color:#5d6885;font-size:13px;margin-top:4px">' + escHtml_(r.theme || '') + ' &middot; ' +
      escHtml_(r.channel || 'LinkedIn') + ' &middot; <span style="color:' + statusColor + ';font-weight:600">' +
      escHtml_(r.status || 'Not started') + '</span></div>' +
      (r.notes ? '<div style="color:#5d6885;font-size:13px;margin-top:6px">' + escHtml_(r.notes) + '</div>' : '') +
      '</div>';
  }
  return '<tr style="border-bottom:1px solid #d8deea">' +
    '<td style="padding:8px 6px;white-space:nowrap;color:#5d6885">' + escHtml_(r.target_go_live || '') + '</td>' +
    '<td style="padding:8px 6px">' + title + '</td>' +
    '<td style="padding:8px 6px;color:#5d6885">' + escHtml_(r.posting_from || '') + '</td>' +
    '<td style="padding:8px 6px;color:' + statusColor + ';font-weight:600">' + escHtml_(r.status || 'Not started') + '</td>' +
    '</tr>';
}

function wrapEmail_(innerHtml) {
  return '<div style="font-family:Arial,sans-serif;color:#15213f;max-width:640px">' +
    '<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#1a3aa3;font-weight:600">non sibi ventures</div>' +
    '<h2 style="font-weight:500;margin:4px 0 16px">Marketing Dashboard</h2>' +
    innerHtml +
    '</div>';
}

function escHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function weekRange_(offsetWeeks) {
  const now = new Date();
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + diffToMonday + offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: formatDate_(monday), end: formatDate_(sunday) };
}

function inRange_(dateStr, start, end) {
  return !!dateStr && dateStr >= start && dateStr <= end;
}

// ==========================================================================
// Triggers
// ==========================================================================

/**
 * Run installTriggers() ONCE from the Apps Script editor (select it in the
 * function dropdown at the top, click Run, and approve the permissions
 * prompt). It wires up every recurring job -- you never need to touch
 * Google's own Triggers UI directly.
 *
 * Re-running it is safe: it clears out any triggers this project created
 * before recreating them, so you won't end up with duplicates.
 */
function installTriggers() {
  removeAllTriggers_();

  // Push sheet edits to Supabase almost immediately.
  ScriptApp.newTrigger('onCalendarEdit')
    .forSpreadsheet(SHEET_ID)
    .onEdit()
    .create();

  // Backstop full resync every 15 minutes, in case an edit event is missed
  // (e.g. pasting many rows at once, which Apps Script can coalesce or drop).
  ScriptApp.newTrigger('syncCalendarToSupabase').timeBased().everyMinutes(15).create();

  // Thursday 3:00 PM -- next week's preview.
  ScriptApp.newTrigger('sendThursdayPreview').timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(15).nearMinute(0).create();

  // Monday 8:00 AM -- this week's plan, resent for the team meeting.
  ScriptApp.newTrigger('sendMondayReview').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).nearMinute(0).create();

  // Wednesday 12:00 PM -- reminder if today's post hasn't gone live yet.
  ScriptApp.newTrigger('sendWednesdayReminder').timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(12).nearMinute(0).create();

  Logger.log('Triggers installed. These fire in the timezone set in appsscript.json (America/Chicago = CDT/CST).');
}

function removeAllTriggers_() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
}

// ==========================================================================
// Menu
// ==========================================================================

/**
 * Adds a "non sibi" menu to the Sheet itself, so the automation can be run
 * without touching the Apps Script editor.
 *
 * NOTE: this only fires when the script lives INSIDE the spreadsheet
 * (Extensions > Apps Script). In a standalone project it never runs, which is
 * harmless -- everything is still runnable from the editor's Run button.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('non sibi')
    .addItem('Sync calendar to dashboard now', 'syncCalendarToSupabase')
    .addSeparator()
    .addItem('Install/reinstall scheduled jobs', 'installTriggers')
    .addSeparator()
    .addItem('Send me a test preview (just me)', 'sendTestPreviewToMe')
    .addItem("Run Wednesday reminder check", 'sendWednesdayReminder')
    .addToUi();
}

/**
 * Same email as the Thursday preview, but sent only to whoever clicks it --
 * safe way to see what the team will get without emailing the team.
 */
function sendTestPreviewToMe() {
  const me = Session.getActiveUser().getEmail();
  const { start, end } = weekRange_(1);
  const rows = readCalendarRows_()
    .filter(r => inRange_(r.target_go_live, start, end))
    .sort((a, b) => (a.target_go_live || '').localeCompare(b.target_go_live || ''));

  const needsReview = rows.filter(r => !isLive_(r));
  const flaggedNames = new Set();
  needsReview.forEach(r => {
    String(r.posting_from || '').split(',').map(s => s.trim()).filter(Boolean).forEach(n => flaggedNames.add(n));
  });

  const body = (rows.length === 0
      ? '<p>Nothing is scheduled for ' + start + ' to ' + end + ' yet.</p>'
      : (needsReview.length
          ? '<p><b>Needs review before it goes out:</b> ' + Array.from(flaggedNames).map(escHtml_).join(', ') + '</p>'
          : '<p style="color:#2e8a48"><b>Everything for this week is already marked Live.</b></p>') +
        '<table style="border-collapse:collapse;width:100%;font-size:14px">' +
        rows.map(r => renderRowHtml_(r)).join('') + '</table>') +
    '<p style="margin-top:20px"><a href="' + DASHBOARD_URL + '">Open the full dashboard →</a></p>' +
    '<p style="color:#8a93ac;font-size:12px">This was a test — only you received it.</p>';

  MailApp.sendEmail({
    to: me,
    subject: '[TEST] Next week on LinkedIn: ' + start + ' to ' + end,
    htmlBody: wrapEmail_(body),
  });

  // getUi() only exists when the script is bound to the Sheet; in a standalone
  // project fall back to the execution log so this never errors out.
  Logger.log('Test preview sent to ' + me);
  try {
    SpreadsheetApp.getUi().alert('Test preview sent to ' + me);
  } catch (err) {
    // standalone project -- no spreadsheet UI to show an alert in
  }
}

