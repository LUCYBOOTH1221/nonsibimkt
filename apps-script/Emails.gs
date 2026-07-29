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

// A row counts as published once a real LinkedIn post link lands in it --
// dropping the link is the signal, regardless of whether anyone remembered to
// flip Status to "Live". This matches how the dashboard marks a card "posted",
// so the calendar and the reminder emails never disagree.
function isLive_(r) {
  return /linkedin\.com/i.test(r.link || '');
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
