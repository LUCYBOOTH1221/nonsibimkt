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
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
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

  // Wednesday 4:00 PM -- reminder if today's post hasn't gone live yet.
  ScriptApp.newTrigger('sendWednesdayReminder').timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(16).nearMinute(0).create();

  Logger.log('Triggers installed. These fire in the timezone set in appsscript.json (America/Chicago = CDT/CST).');
}

function removeAllTriggers_() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
}
