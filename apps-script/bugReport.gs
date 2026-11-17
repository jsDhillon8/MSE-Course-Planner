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
// Columns are written by position: don't insert/reorder columns A–I in the sheet.
var HEADERS = ["Timestamp", "Summary", "Description", "Steps", "Page", "Theme", "Viewport", "User agent", "Status", "Notes"];
var STATUSES = ["New", "Investigating", "Fixed", "Won't fix", "Duplicate"];
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
      "New", // Status
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

// ─── One-time sheet setup ─────────────────────────────────────────────────
// Run manually from the editor (pick "setupSheet" in the function dropdown → Run).
// Safe to re-run: it replaces only what it created and leaves your own formatting alone.

var OVERVIEW_NAME = "Overview";
var RULE_DONE = '=OR($I2="Fixed",$I2="Won\'t fix",$I2="Duplicate")';
var RULE_NEW = '=OR($I2="New",AND($A2<>"",$I2=""))';

function setupSheet() {
  var sheet = getSheet();
  setupNotesColumn(sheet);
  setupStatusDropdown(sheet);
  tagUntriagedAsNew();
  setupConditionalFormatting(sheet);
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).createFilter();
  setupOverview();
  SpreadsheetApp.getActiveSpreadsheet().toast("Sheet setup complete.", "Bug reports", 5);
}

// Backfill: any existing report (has a timestamp) with an empty Status becomes "New".
// New reports already get "New" in doPost; this catches rows from before that change.
// Can also be run on its own from the function dropdown.
function tagUntriagedAsNew() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var range = sheet.getRange(2, 1, lastRow - 1, 9);
  var values = range.getValues();
  var statuses = values.map(function (row) {
    return [row[0] !== "" && row[8] === "" ? "New" : row[8]];
  });
  var changed = statuses.filter(function (s, i) { return s[0] !== values[i][8]; }).length;
  if (changed > 0) sheet.getRange(2, 9, statuses.length, 1).setValues(statuses);
  return changed;
}

function setupNotesColumn(sheet) {
  var header = sheet.getRange(1, 10);
  if (!header.getValue()) header.setValue("Notes");
  sheet.setColumnWidth(10, 300);
  sheet.getRange("J:J").setWrap(true).setVerticalAlignment("top");
}

// Only adds a dropdown if column I doesn't already have one (keeps your chip colours).
function setupStatusDropdown(sheet) {
  var range = sheet.getRange(2, 9, sheet.getMaxRows() - 1, 1);
  if (range.getDataValidation()) return;
  range.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build()
  );
}

function setupConditionalFormatting(sheet) {
  var range = sheet.getRange(2, 1, sheet.getMaxRows() - 1, HEADERS.length);
  // Drop previous copies of our rules, keep any you added yourself.
  var rules = sheet.getConditionalFormatRules().filter(function (rule) {
    var cond = rule.getBooleanCondition();
    var formula = cond && cond.getCriteriaValues()[0];
    return formula !== RULE_DONE && formula !== RULE_NEW;
  });
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(RULE_DONE).setFontColor("#9aa0a6").setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(RULE_NEW).setBackground("#fff4cc").setRanges([range]).build()
  );
  sheet.setConditionalFormatRules(rules);
}

function setupOverview() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(OVERVIEW_NAME) || ss.insertSheet(OVERVIEW_NAME, 0);
  sheet.getCharts().forEach(function (chart) { sheet.removeChart(chart); });
  sheet.clear();

  var R = "'" + SHEET_NAME + "'!";
  sheet.getRange("A1").setValue("Bug report overview").setFontSize(16).setFontWeight("bold");

  // Key numbers
  var metrics = [
    ["Metric", "Count"],
    ["Total reports", "=COUNTA(" + R + "A2:A)"],
    ["Untriaged (New)", "=COUNTIF(" + R + "I2:I,\"New\")+COUNTIFS(" + R + "A2:A,\"<>\"," + R + "I2:I,\"\")"],
    ["Investigating", "=COUNTIF(" + R + "I2:I,\"Investigating\")"],
    ["Fixed", "=COUNTIF(" + R + "I2:I,\"Fixed\")"],
    ["Won't fix", "=COUNTIF(" + R + "I2:I,\"Won't fix\")"],
    ["Duplicate", "=COUNTIF(" + R + "I2:I,\"Duplicate\")"],
    ["Last 7 days", "=COUNTIF(" + R + "A2:A,\">=\"&(TODAY()-7))"],
    ["Latest report", "=IFERROR(MAX(" + R + "A2:A),\"-\")"],
  ];
  sheet.getRange(3, 1, metrics.length, 2).setValues(metrics);
  sheet.getRange("B11").setNumberFormat("mmm d, yyyy h:mm");

  // Reports per page (feeds the chart)
  sheet.getRange("D3").setFormula(
    "=IFERROR(QUERY(" + R + "A:E,\"select E, count(A) where E is not null group by E " +
      "order by count(A) desc label E 'Page', count(A) 'Reports'\",1),{\"Page\",\"Reports\"})"
  );

  // Styling
  [sheet.getRange("A3:B3"), sheet.getRange("D3:E3")].forEach(function (header) {
    header.setFontWeight("bold").setBackground("#e8eaed");
  });
  sheet.getRange("A4:A11").setFontColor("#5f6368");
  sheet.getRange("B4:B10").setFontWeight("bold").setHorizontalAlignment("left");
  sheet.getRange("A3:B11").setBorder(true, true, true, true, false, true, "#dadce0", SpreadsheetApp.BorderStyle.SOLID);
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 30);
  sheet.setColumnWidth(4, 260);
  sheet.setColumnWidth(5, 80);
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);

  // Chart: reports per page
  sheet.insertChart(
    sheet.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(sheet.getRange("D3:E30"))
      .setNumHeaders(1)
      .setPosition(3, 7, 0, 0)
      .setOption("title", "Reports by page")
      .setOption("legend", { position: "none" })
      .setOption("colors", ["#4285f4"])
      .setOption("width", 520)
      .setOption("height", 320)
      .build()
  );
}
