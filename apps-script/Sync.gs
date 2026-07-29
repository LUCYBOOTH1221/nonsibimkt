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
  UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/calendar?id=in.(' + toDelete.join(',') + ')', {
    method: 'delete',
    headers: {
      apikey: getSupabaseServiceKey(),
      Authorization: 'Bearer ' + getSupabaseServiceKey(),
      Prefer: 'return=minimal',
    },
    muteHttpExceptions: true,
  });
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
