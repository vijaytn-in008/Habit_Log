// ============================================================
// Behavior Log — Google Apps Script Backend
// Deploy this as a Web App (Execute as: Me, Access: Anyone).
// ============================================================

/**
 * Verifies if the required sheets and headers exist. 
 * If they do not, it creates them automatically.
 */
function initializeSheetsIfNeeded() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup "Habits" sheet
  var habitsSheet = ss.getSheetByName("Habits");
  if (!habitsSheet) {
    habitsSheet = ss.insertSheet("Habits");
    habitsSheet.appendRow(["Name", "Time", "Place"]);
    // Add default templates
    habitsSheet.appendRow(["Meditation", "07:00 AM", "Living Room"]);
    habitsSheet.appendRow(["Reading", "09:00 PM", "Bedroom"]);
  }

  // 2. Setup "Tasks" sheet
  var tasksSheet = ss.getSheetByName("Tasks");
  if (!tasksSheet) {
    tasksSheet = ss.insertSheet("Tasks");
    tasksSheet.appendRow(["Name", "Time", "Place"]);
    // Add default templates
    tasksSheet.appendRow(["Plan Day", "08:00 AM", "Desk"]);
    tasksSheet.appendRow(["Check Emails", "05:00 PM", "Office"]);
  }

  // 3. Setup "Logs" sheet
  var logsSheet = ss.getSheetByName("Logs");
  if (!logsSheet) {
    logsSheet = ss.insertSheet("Logs");
    logsSheet.appendRow(["Date", "Time", "Type", "Name", "Status", "Reason", "Notes"]);
  }
}

/**
 * Handle all GET requests.
 * Supported actions: getHabits, getTasks, getLogs, saveLog
 */
function doGet(e) {
  initializeSheetsIfNeeded();
  var action = e.parameter.action;

  if (action === 'getHabits') return getItems('Habits');
  if (action === 'getTasks')  return getItems('Tasks');
  if (action === 'getLogs')   return getLogs();
  if (action === 'saveLog')   return saveLog(e.parameter);

  return jsonResponse({ error: 'Unknown action: ' + action });
}

/**
 * Also handle POST (in case the client sends POST).
 * Parses the JSON body and delegates to the same handlers.
 */
function doPost(e) {
  initializeSheetsIfNeeded();
  var payload = JSON.parse(e.postData.contents);
  var action  = payload.action;

  if (action === 'saveLog') return saveLog(payload);

  return jsonResponse({ error: 'Unknown action: ' + action });
}

// ============================================================
// Handlers
// ============================================================

/**
 * Read all items (habits or tasks) from the named sheet.
 * Expects columns: A=Name, B=Time, C=Place (with header row).
 */
function getItems(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var rows  = sheet.getDataRange().getValues();
  var items = [];

  // Skip header row (row 0)
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0]) { // Only include rows with a name
      items.push({
        name:  rows[i][0].toString().trim(),
        time:  rows[i][1] ? rows[i][1].toString().trim() : '',
        place: rows[i][2] ? rows[i][2].toString().trim() : ''
      });
    }
  }

  return jsonResponse({ status: 'ok', data: items });
}

/**
 * Read all log entries from the Logs sheet.
 * Expects columns: A=Date, B=Time, C=Type, D=Name, E=Status, F=Reason, G=Notes
 */
function getLogs() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Logs');
  var rows  = sheet.getDataRange().getValues();
  var logs  = [];

  // Skip header row (row 0)
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      logs.push({
        date:   formatDate(rows[i][0]),
        time:   rows[i][1] ? rows[i][1].toString().trim() : '',
        type:   rows[i][2] ? rows[i][2].toString().trim() : '',
        name:   rows[i][3] ? rows[i][3].toString().trim() : '',
        status: rows[i][4] ? rows[i][4].toString().trim() : '',
        reason: rows[i][5] ? rows[i][5].toString().trim() : '',
        notes:  rows[i][6] ? rows[i][6].toString().trim() : ''
      });
    }
  }

  return jsonResponse({ status: 'ok', data: logs });
}

/**
 * Append a new row to the Logs sheet.
 * @param {Object} params — { date, time, type, name, status, reason, notes }
 */
function saveLog(params) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Logs');
  sheet.appendRow([
    params.date   || '',
    params.time   || '',
    params.type   || '',
    params.name   || '',
    params.status || '',
    params.reason || '',
    params.notes  || ''
  ]);

  return jsonResponse({ status: 'ok', message: 'Log saved' });
}

// ============================================================
// Utilities
// ============================================================

/**
 * Safely format a date value from Sheets.
 * Sheets may store dates as Date objects or strings.
 */
function formatDate(value) {
  if (value instanceof Date) {
    var y = value.getFullYear();
    var m = ('0' + (value.getMonth() + 1)).slice(-2);
    var d = ('0' + value.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  return value ? value.toString().trim() : '';
}

/**
 * Return a JSON response with correct MIME type and CORS support.
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
