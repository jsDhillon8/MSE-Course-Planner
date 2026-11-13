/**
 * Bug report backend (Google Apps Script web app).
 *
 * This file is NOT deployed from the repo. It's kept here for version control only.
 * Setup:
 *   1. Create a Google Sheet, then Extensions → Apps Script. Paste this file in.
 *   2. (Optional) Project Settings → Script Properties → add NOTIFY_EMAIL = you@example.com
 *      to get an email for each report.
 *   3. Deploy → New deployment → type "Web app"
 *        Execute as: Me
 *        Who has access: Anyone
 *      Authorize when prompted, then copy the /exec URL into VITE_BUG_REPORT_URL.
 *   4. After editing this script: Deploy → Manage deployments → edit → Version: "New version".
 *      (Creating a *new* deployment changes the URL.)
 *
 * The frontend POSTs JSON as text/plain (avoids a CORS preflight, which Apps Script can't answer).
 * Apps Script always responds 200, so success/failure is in the JSON body: { ok, error? }.
 */

var SHEET_NAME = "Reports";
var HEADERS = ["Timestamp", "Summary", "Description", "Steps", "Page", "Theme", "Viewport", "User agent"];
var LIMITS = { summary: 150, description: 5000, steps: 3000, page: 300, theme: 20, viewport: 30, userAgent: 400 };
var MAX_PER_MINUTE = 10; // global throttle across all users

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    // Honeypot: real users never see or fill this field.
    if (data.website) return json({ ok: true });

    var summary = clean(data.summary, LIMITS.summary);
    var description = clean(data.description, LIMITS.description);
    if (!summary || !description) return json({ ok: false, error: "Summary and description are required." });

    if (!allowRequest()) return json({ ok: false, error: "Too many reports right now. Please try again in a minute." });

    var row = [
      new Date(),
      summary,
      description,
      clean(data.steps, LIMITS.steps),
      clean(data.page, LIMITS.page),
      clean(data.theme, LIMITS.theme),
      clean(data.viewport, LIMITS.viewport),
      clean(data.userAgent, LIMITS.userAgent),
    ];

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      getSheet().appendRow(row);
    } finally {
      lock.releaseLock();
    }

    notify(summary, description, row);
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: "Could not save the report." });
  }
}

// Simple health check: open the /exec URL in a browser.
function doGet() {
  return json({ ok: true });
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Trim, cap length, and neutralize spreadsheet formula injection (=, +, -, @).
function clean(value, max) {
  var s = String(value == null ? "" : value).trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function allowRequest() {
  var cache = CacheService.getScriptCache();
  var key = "count-" + Math.floor(Date.now() / 60000);
  var count = Number(cache.get(key) || 0);
  if (count >= MAX_PER_MINUTE) return false;
  cache.put(key, String(count + 1), 120);
  return true;
}

function notify(summary, description, row) {
  var to = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  if (!to) return;
  try {
    MailApp.sendEmail(
      to,
      "[MSE Planner bug] " + summary,
      description + "\n\nSteps:\n" + (row[3] || "-") + "\n\nPage: " + row[4] + "\nTheme: " + row[5] +
        "\nViewport: " + row[6] + "\nUA: " + row[7] + "\n\n" + SpreadsheetApp.getActiveSpreadsheet().getUrl()
    );
  } catch (err) {
    console.error("Email failed: " + err);
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
