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
