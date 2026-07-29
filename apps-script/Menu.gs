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
