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
  if (!ss) {
    throw new Error(
      "Spreadsheet not found. Make sure this Apps Script was created from INSIDE your Google Sheet via 'Extensions' -> 'Apps Script' (container-bound script). If you created it directly in Google Drive, it will not work."
    );
  }
  
  // 1. Setup "Habits" sheet (columns: Name, Time, Place, BehaviorType, Remind, Priority, PrevHabit, NextHabit)
  var habitsSheet = ss.getSheetByName("Habits");
  if (!habitsSheet) {
    habitsSheet = ss.insertSheet("Habits");
    habitsSheet.appendRow(["Name", "Time", "Place", "BehaviorType", "Remind", "Priority", "PrevHabit", "NextHabit"]);
    // Add default templates
    habitsSheet.appendRow(["Meditation", "07:00 AM", "Living Room", "Good", "Yes", "To Do", "", ""]);
    habitsSheet.appendRow(["Reading", "09:00 PM", "Bedroom", "Good", "No", "Optional", "", ""]);
    habitsSheet.appendRow(["Scrolling Social Media", "10:00 PM", "Bedroom", "Bad", "No", "Don't Do", "", ""]);
  } else {
    // Check if BehaviorType column exists (Column D)
    if (habitsSheet.getLastColumn() < 4) {
      habitsSheet.getRange(1, 4).setValue("BehaviorType");
      var lastRow = habitsSheet.getLastRow();
      if (lastRow > 1) {
        var range = habitsSheet.getRange(2, 4, lastRow - 1, 1);
        var values = [];
        for (var i = 0; i < lastRow - 1; i++) {
          values.push(["Good"]);
        }
        range.setValues(values);
      }
    }
    // Check if Remind column exists (Column E)
    if (habitsSheet.getLastColumn() < 5) {
      habitsSheet.getRange(1, 5).setValue("Remind");
      var lastRow = habitsSheet.getLastRow();
      if (lastRow > 1) {
        var range = habitsSheet.getRange(2, 5, lastRow - 1, 1);
        var values = [];
        for (var i = 0; i < lastRow - 1; i++) {
          values.push(["No"]);
        }
        range.setValues(values);
      }
    }
    // v4 migration: Priority column (Column F)
    if (habitsSheet.getLastColumn() < 6) {
      habitsSheet.getRange(1, 6).setValue("Priority");
    }
    // v4 migration: PrevHabit column (Column G)
    if (habitsSheet.getLastColumn() < 7) {
      habitsSheet.getRange(1, 7).setValue("PrevHabit");
    }
    // v4 migration: NextHabit column (Column H)
    if (habitsSheet.getLastColumn() < 8) {
      habitsSheet.getRange(1, 8).setValue("NextHabit");
    }
  }

  // 2. Setup "Tasks" sheet (columns: Name, Time, Place, Remind, TaskDate, StartDate, Deadline, Subtasks, Priority, Recurrence, IsCompleted)
  var tasksSheet = ss.getSheetByName("Tasks");
  if (!tasksSheet) {
    tasksSheet = ss.insertSheet("Tasks");
    tasksSheet.appendRow(["Name", "Time", "Place", "Remind", "TaskDate", "StartDate", "Deadline", "Subtasks", "Priority", "Recurrence", "IsCompleted"]);
    // Add default templates
    tasksSheet.appendRow(["Plan Day", "08:00 AM", "Desk", "Yes", "", "", "", "[]", "To Do", "[]", "No"]);
    tasksSheet.appendRow(["Check Emails", "05:00 PM", "Office", "No", "", "", "", "[]", "Optional", "[]", "No"]);
  } else {
    // Check if Remind column exists (Column D)
    if (tasksSheet.getLastColumn() < 4) {
      tasksSheet.getRange(1, 4).setValue("Remind");
      var lastRow = tasksSheet.getLastRow();
      if (lastRow > 1) {
        var range = tasksSheet.getRange(2, 4, lastRow - 1, 1);
        var values = [];
        for (var i = 0; i < lastRow - 1; i++) {
          values.push(["No"]);
        }
        range.setValues(values);
      }
    }
    // Check if extra task date columns exist
    if (tasksSheet.getLastColumn() < 5) {
      tasksSheet.getRange(1, 5).setValue("TaskDate");
    }
    if (tasksSheet.getLastColumn() < 6) {
      tasksSheet.getRange(1, 6).setValue("StartDate");
    }
    if (tasksSheet.getLastColumn() < 7) {
      tasksSheet.getRange(1, 7).setValue("Deadline");
    }
    if (tasksSheet.getLastColumn() < 8) {
      tasksSheet.getRange(1, 8).setValue("Subtasks");
    }
    // v4 migration: Priority (Column I)
    if (tasksSheet.getLastColumn() < 9) {
      tasksSheet.getRange(1, 9).setValue("Priority");
    }
    // v4 migration: Recurrence (Column J)
    if (tasksSheet.getLastColumn() < 10) {
      tasksSheet.getRange(1, 10).setValue("Recurrence");
    }
    // v4 migration: IsCompleted (Column K)
    if (tasksSheet.getLastColumn() < 11) {
      tasksSheet.getRange(1, 11).setValue("IsCompleted");
    }
    // v5 migration: OriginalDeadline, IsTemporary, Objective (Columns L, M, N)
    if (tasksSheet.getLastColumn() < 12) {
      tasksSheet.getRange(1, 12).setValue("OriginalDeadline");
    }
    if (tasksSheet.getLastColumn() < 13) {
      tasksSheet.getRange(1, 13).setValue("IsTemporary");
    }
    if (tasksSheet.getLastColumn() < 14) {
      tasksSheet.getRange(1, 14).setValue("Objective");
    }
  }

  // 3. Setup "Logs" sheet (expanded with new behavioral fields)
  var logsSheet = ss.getSheetByName("Logs");
  if (!logsSheet) {
    logsSheet = ss.insertSheet("Logs");
    logsSheet.appendRow([
      "Date", "Time", "Type", "Name", "Status", "Reason", "Notes",
      "LoggedAt", "ActivityDate", "ActivityStartTime",
      "PreviousActivity", "AlternativeActivity", "Interruption",
      "Duration", "Place", "Priority"
    ]);
  } else {
    // v4 migration: add new columns if missing
    var logCols = logsSheet.getLastColumn();
    var newHeaders = [
      [8, "LoggedAt"], [9, "ActivityDate"], [10, "ActivityStartTime"],
      [11, "PreviousActivity"], [12, "AlternativeActivity"], [13, "Interruption"],
      [14, "Duration"], [15, "Place"], [16, "Priority"],
      [17, "CompletedWork"], [18, "Outcome"], [19, "ProblemsFaced"],
      [20, "RemainingWork"], [21, "Objective"], [22, "SubtaskName"], [23, "ParentTaskName"],
      [24, "NewDeadline"], [25, "ExtensionReason"]
    ];
    newHeaders.forEach(function(pair) {
      if (logCols < pair[0]) {
        logsSheet.getRange(1, pair[0]).setValue(pair[1]);
      }
    });
  }

  // 4. Setup "Reflections" sheet (separate from Logs — stores analyzed reflection data)
  var reflSheet = ss.getSheetByName("Reflections");
  if (!reflSheet) {
    reflSheet = ss.insertSheet("Reflections");
    // Key = date|type|name — used for dedup. Strategy = how I succeeded. FailReason + BetterPlan for failures.
    reflSheet.appendRow(["Key", "Date", "Type", "Name", "Status", "Strategy", "FailReason", "BetterPlan", "EngagedActivity"]);
  } else {
    // Check if column exists, if not, write header
    if (reflSheet.getLastColumn() < 9) {
      reflSheet.getRange(1, 9).setValue("EngagedActivity");
    }
  }

  // 5. Setup "TodaysPlan" sheet
  var planSheet = ss.getSheetByName("TodaysPlan");
  if (!planSheet) {
    planSheet = ss.insertSheet("TodaysPlan");
    planSheet.appendRow(["ID", "TargetName", "TargetType", "Date", "OriginalStartTime", "OriginalEndTime", "CurrentStartTime", "CurrentEndTime", "Status", "CompletionType", "RescheduleCount", "CreatedAt", "CompletedAt", "ChangeLog"]);
  }
}

/**
 * Handle all GET requests.
 * Supported actions: getHabits, getTasks, getLogs, saveLog, addItem, deleteItem, toggleReminder, updateItem, ping
 */
function doGet(e) {
  try {
    initializeSheetsIfNeeded();
    var action = e.parameter.action;

    if (action === 'ping')            return jsonResponse({ status: 'ok', message: 'Connected to spreadsheet: ' + SpreadsheetApp.getActiveSpreadsheet().getName() });
    if (action === 'getHabits')       return getItems('Habits');
    if (action === 'getTasks')        return getItems('Tasks');
    if (action === 'getLogs')         return getLogs();
    if (action === 'saveLog')         return saveLog(e.parameter);
    if (action === 'addItem')         return addItem(e.parameter);
    if (action === 'deleteItem')      return deleteItem(e.parameter);
    if (action === 'toggleReminder')  return toggleReminder(e.parameter);
    if (action === 'updateItem')      return updateItem(e.parameter);
    if (action === 'saveReflection')  return saveReflection(e.parameter);
    if (action === 'getReflections')  return getReflections();
    if (action === 'savePlanItem')    return savePlanItem(e.parameter);
    if (action === 'getPlanItems')    return getPlanItems();

    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message || err.toString() });
  }
}

/**
 * Also handle POST (in case the client sends POST).
 * Parses the JSON body and delegates to the same handlers.
 */
function doPost(e) {
  try {
    initializeSheetsIfNeeded();
    var payload = JSON.parse(e.postData.contents);
    var action  = payload.action;

    if (action === 'saveLog')         return saveLog(payload);
    if (action === 'addItem')         return addItem(payload);
    if (action === 'deleteItem')      return deleteItem(payload);
    if (action === 'toggleReminder')  return toggleReminder(payload);
    if (action === 'updateItem')      return updateItem(payload);
    if (action === 'saveReflection')  return saveReflection(payload);
    if (action === 'savePlanItem')    return savePlanItem(payload);

    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message || err.toString() });
  }
}

// ============================================================
// Handlers
// ============================================================

/**
 * Read all items (habits or tasks) from the named sheet.
 * Updated to include new v4 fields (priority, chain, recurrence).
 */
function getItems(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var rows  = sheet.getDataRange().getValues();
  var items = [];

  // Skip header row (row 0)
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0]) { // Only include rows with a name
      var item = {
        name:          rows[i][0].toString().trim(),
        time:          rows[i][1] ? rows[i][1].toString().trim() : '',
        place:         rows[i][2] ? rows[i][2].toString().trim() : ''
      };

      if (sheetName === 'Habits') {
        item.behaviorType = rows[i][3] ? rows[i][3].toString().trim() : 'Good';
        item.remind       = rows[i][4] === 'Yes';
        item.priority     = rows[i][5] ? rows[i][5].toString().trim() : '';
        item.prevHabit    = rows[i][6] ? rows[i][6].toString().trim() : '';
        item.nextHabit    = rows[i][7] ? rows[i][7].toString().trim() : '';
      } else {
        // Tasks
        item.remind       = rows[i][3] === 'Yes';
        item.taskDate     = rows[i][4] ? formatDate(rows[i][4]) : '';
        item.startDate    = rows[i][5] ? formatDate(rows[i][5]) : '';
        item.deadline     = rows[i][6] ? formatDate(rows[i][6]) : '';
        item.subtasks     = rows[i][7] ? parseSubtasks(rows[i][7]) : [];
        item.priority     = rows[i][8] ? rows[i][8].toString().trim() : '';
        item.recurrence   = rows[i][9] ? parseJSON(rows[i][9]) : [];
        item.isCompleted  = rows[i][10] === 'Yes';
        item.originalDeadline = rows[i][11] ? formatDate(rows[i][11]) : '';
        item.isTemporary  = rows[i][12] === 'Yes';
        item.objective    = rows[i][13] ? rows[i][13].toString().trim() : '';
      }

      items.push(item);
    }
  }

  return jsonResponse({ status: 'ok', data: items });
}

/**
 * Read all log entries from the Logs sheet.
 * Updated to include new v4 behavioral fields.
 */
function getLogs() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Logs');
  var rows  = sheet.getDataRange().getValues();
  var logs  = [];

  // Skip header row (row 0)
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      logs.push({
        date:                formatDate(rows[i][0]),
        time:                rows[i][1] ? rows[i][1].toString().trim() : '',
        type:                rows[i][2] ? rows[i][2].toString().trim() : '',
        name:                rows[i][3] ? rows[i][3].toString().trim() : '',
        status:              rows[i][4] ? rows[i][4].toString().trim() : '',
        reason:              rows[i][5] ? rows[i][5].toString().trim() : '',
        notes:               rows[i][6] ? rows[i][6].toString().trim() : '',
        loggedAt:            rows[i][7] ? rows[i][7].toString().trim() : '',
        activityDate:        rows[i][8] ? formatDate(rows[i][8]) : '',
        activityStartTime:   rows[i][9] ? rows[i][9].toString().trim() : '',
        previousActivity:    rows[i][10] ? rows[i][10].toString().trim() : '',
        alternativeActivity: rows[i][11] ? rows[i][11].toString().trim() : '',
        interruption:        rows[i][12] ? rows[i][12].toString().trim() : '',
        duration:            rows[i][13] ? rows[i][13].toString().trim() : '',
        place:               rows[i][14] ? rows[i][14].toString().trim() : '',
        priority:            rows[i][15] ? rows[i][15].toString().trim() : '',
        completedWork:       rows[i][16] ? rows[i][16].toString().trim() : '',
        outcome:             rows[i][17] ? rows[i][17].toString().trim() : '',
        problemsFaced:       rows[i][18] ? rows[i][18].toString().trim() : '',
        remainingWork:       rows[i][19] ? rows[i][19].toString().trim() : '',
        objective:           rows[i][20] ? rows[i][20].toString().trim() : '',
        subtaskName:         rows[i][21] ? rows[i][21].toString().trim() : '',
        parentTaskName:      rows[i][22] ? rows[i][22].toString().trim() : ''
      });
    }
  }

  return jsonResponse({ status: 'ok', data: logs });
}

/**
 * Append a new row to the Logs sheet.
 * Updated to include new v4 behavioral fields.
 * @param {Object} params — { date, time, type, name, status, reason, notes, loggedAt, activityDate, activityStartTime, previousActivity, alternativeActivity, interruption, duration, place, priority }
 */
function saveLog(params) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Logs');
  sheet.appendRow([
    params.date                || '',
    params.time                || '',
    params.type                || '',
    params.name                || '',
    params.status              || '',
    params.reason              || '',
    params.notes               || '',
    params.loggedAt            || '',
    params.activityDate        || '',
    params.activityStartTime   || '',
    params.previousActivity    || '',
    params.alternativeActivity || '',
    params.interruption        || '',
    params.duration            || '',
    params.place               || '',
    params.priority            || '',
    params.completedWork       || '',
    params.outcome             || '',
    params.problemsFaced       || '',
    params.remainingWork       || '',
    params.objective           || '',
    params.subtaskName         || '',
    params.parentTaskName      || '',
    params.newDeadline         || '',
    params.extensionReason     || ''
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

/**
 * Add a new item to Habits or Tasks sheet.
 * Updated to include v4 fields (priority, chain, recurrence).
 */
function addItem(params) {
  var sheetName = params.type === 'Habit' ? 'Habits' : 'Tasks';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var remindValue = (params.remind === 'true' || params.remind === true) ? 'Yes' : 'No';
  if (sheetName === 'Habits') {
    sheet.appendRow([
      params.name         || '',
      params.time         || '',
      params.place        || '',
      params.behaviorType || 'Good',
      remindValue,
      params.priority     || '',
      params.prevHabit    || '',
      params.nextHabit    || ''
    ]);
  } else {
    sheet.appendRow([
      params.name         || '',
      params.time         || '',
      params.place        || '',
      remindValue,
      params.taskDate     || '',
      params.startDate    || '',
      params.deadline     || '',
      params.subtasks     || '[]',
      params.priority     || '',
      params.recurrence   || '[]',
      (params.isCompleted === 'true' || params.isCompleted === true) ? 'Yes' : 'No',
      params.originalDeadline || '',
      (params.isTemporary === 'true' || params.isTemporary === true) ? 'Yes' : 'No',
      params.objective    || ''
    ]);
  }
  return jsonResponse({ status: 'ok', message: 'Item added' });
}

/**
 * Find and delete a habit or task row by name.
 */
function deleteItem(params) {
  var sheetName = params.type === 'Habit' ? 'Habits' : 'Tasks';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var rows = sheet.getDataRange().getValues();
  var targetName = (params.name || '').toString().trim().toLowerCase();

  // Search rows (skipping header row 0)
  for (var i = 1; i < rows.length; i++) {
    var name = (rows[i][0] || '').toString().trim().toLowerCase();
    if (name === targetName) {
      sheet.deleteRow(i + 1); // deleteRow takes 1-indexed row number
      return jsonResponse({ status: 'ok', message: 'Item deleted' });
    }
  }

  return jsonResponse({ error: 'Item not found in sheet: ' + params.name });
}

/**
 * Update an existing item's fields (priority, chain links, recurrence, isCompleted, etc).
 * Finds the row by name and updates columns in-place.
 */
function updateItem(params) {
  var sheetName = params.type === 'Habit' ? 'Habits' : 'Tasks';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var rows = sheet.getDataRange().getValues();
  var targetName = (params.name || '').toString().trim().toLowerCase();

  for (var i = 1; i < rows.length; i++) {
    var name = (rows[i][0] || '').toString().trim().toLowerCase();
    if (name === targetName) {
      var rowNum = i + 1; // 1-indexed

      if (sheetName === 'Habits') {
        // Update all writable columns (skip name in col A)
        if (params.time !== undefined)         sheet.getRange(rowNum, 2).setValue(params.time);
        if (params.place !== undefined)        sheet.getRange(rowNum, 3).setValue(params.place);
        if (params.behaviorType !== undefined) sheet.getRange(rowNum, 4).setValue(params.behaviorType);
        if (params.remind !== undefined)       sheet.getRange(rowNum, 5).setValue((params.remind === 'true' || params.remind === true) ? 'Yes' : 'No');
        if (params.priority !== undefined)     sheet.getRange(rowNum, 6).setValue(params.priority);
        if (params.prevHabit !== undefined)    sheet.getRange(rowNum, 7).setValue(params.prevHabit);
        if (params.nextHabit !== undefined)    sheet.getRange(rowNum, 8).setValue(params.nextHabit);
      } else {
        // Tasks
        if (params.time !== undefined)         sheet.getRange(rowNum, 2).setValue(params.time);
        if (params.place !== undefined)        sheet.getRange(rowNum, 3).setValue(params.place);
        if (params.remind !== undefined)       sheet.getRange(rowNum, 4).setValue((params.remind === 'true' || params.remind === true) ? 'Yes' : 'No');
        if (params.taskDate !== undefined)     sheet.getRange(rowNum, 5).setValue(params.taskDate);
        if (params.startDate !== undefined)    sheet.getRange(rowNum, 6).setValue(params.startDate);
        if (params.deadline !== undefined)     sheet.getRange(rowNum, 7).setValue(params.deadline);
        if (params.subtasks !== undefined)     sheet.getRange(rowNum, 8).setValue(params.subtasks);
        if (params.priority !== undefined)     sheet.getRange(rowNum, 9).setValue(params.priority);
        if (params.recurrence !== undefined)   sheet.getRange(rowNum, 10).setValue(params.recurrence);
        if (params.isCompleted !== undefined)  sheet.getRange(rowNum, 11).setValue((params.isCompleted === 'true' || params.isCompleted === true) ? 'Yes' : 'No');
        if (params.originalDeadline !== undefined) sheet.getRange(rowNum, 12).setValue(params.originalDeadline);
        if (params.isTemporary !== undefined)  sheet.getRange(rowNum, 13).setValue((params.isTemporary === 'true' || params.isTemporary === true) ? 'Yes' : 'No');
        if (params.objective !== undefined)    sheet.getRange(rowNum, 14).setValue(params.objective);
      }

      return jsonResponse({ status: 'ok', message: 'Item updated' });
    }
  }

  return jsonResponse({ error: 'Item not found in sheet: ' + params.name });
}

/**
 * Save a reflection entry to the Reflections sheet.
 * Server-side deduplication: skip if the same Key already exists.
 * Key = date|type|name (e.g. "2025-07-13|Habit|Meditation")
 * @param {Object} params — { key, date, type, name, status, strategy, failReason, betterPlan }
 */
function saveReflection(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Reflections');
  if (!sheet) {
    initializeSheetsIfNeeded();
    sheet = ss.getSheetByName('Reflections');
  }

  var keyToInsert = params.key || ((params.date || '') + '|' + (params.type || '') + '|' + (params.name || ''));

  // Dedup check: scan Column A (Key) for existing match
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var existingKeys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < existingKeys.length; i++) {
      if (existingKeys[i][0] === keyToInsert) {
        // Already exists — do not write again
        return jsonResponse({ status: 'ok', message: 'Reflection already exists (dedup)' });
      }
    }
  }

  sheet.appendRow([
    keyToInsert,
    params.date       || '',
    params.type       || '',
    params.name       || '',
    params.status     || '',
    params.strategy   || '',
    params.failReason || '',
    params.betterPlan || '',
    params.engagedActivity || ''
  ]);

  return jsonResponse({ status: 'ok', message: 'Reflection saved' });
}

/**
 * Fetch all entries from the Reflections sheet.
 * Returns: [{ key, date, type, name, status, strategy, failReason, betterPlan }]
 */
function getReflections() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Reflections');
  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonResponse({ status: 'ok', data: [] });
  }

  var rows = sheet.getDataRange().getValues();
  var reflections = [];
  for (var i = 1; i < rows.length; i++) {
    reflections.push({
      key:        rows[i][0] ? rows[i][0].toString().trim() : '',
      date:       rows[i][1] ? rows[i][1].toString().trim() : '',
      type:       rows[i][2] ? rows[i][2].toString().trim() : '',
      name:       rows[i][3] ? rows[i][3].toString().trim() : '',
      status:     rows[i][4] ? rows[i][4].toString().trim() : '',
      strategy:   rows[i][5] ? rows[i][5].toString().trim() : '',
      failReason: rows[i][6] ? rows[i][6].toString().trim() : '',
      betterPlan: rows[i][7] ? rows[i][7].toString().trim() : '',
      engagedActivity: rows[i][8] ? rows[i][8].toString().trim() : ''
    });
  }
  return jsonResponse({ status: 'ok', data: reflections });
}

/**
 * Helper to safely parse subtasks JSON string.
 */
function parseSubtasks(val) {
  if (!val) return [];
  try {
    return JSON.parse(val.toString());
  } catch(e) {
    return [];
  }
}

/**
 * Helper to safely parse any JSON string (for recurrence arrays, etc).
 */
function parseJSON(val) {
  if (!val) return [];
  try {
    return JSON.parse(val.toString());
  } catch(e) {
    return [];
  }
}

/**
 * Handle saving a plan item.
 * Creates it if the ID does not exist, updates it if it does.
 */
function savePlanItem(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('TodaysPlan');
  
  if (!sheet) {
    initializeSheetsIfNeeded();
    sheet = ss.getSheetByName('TodaysPlan');
  }

  var id = params.id;
  if (!id) return jsonResponse({ error: 'Missing plan item ID' });

  var lastRow = sheet.getLastRow();
  var rowIndex = -1;

  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] == id) {
        rowIndex = i + 2;
        break;
      }
    }
  }

  var rowData = [
    id,
    params.targetName || '',
    params.targetType || '',
    params.date || '',
    params.originalStartTime || '',
    params.originalEndTime || '',
    params.currentStartTime || '',
    params.currentEndTime || '',
    params.status || '',
    params.completionType || '',
    params.rescheduleCount || 0,
    params.createdAt || '',
    params.completedAt || '',
    params.changeLog || '[]'
  ];

  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return jsonResponse({ status: 'ok', message: 'Plan item saved' });
}

/**
 * Fetch all plan items from TodaysPlan sheet.
 */
function getPlanItems() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('TodaysPlan');
  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonResponse({ status: 'ok', data: [] });
  }

  var rows = sheet.getDataRange().getValues();
  var items = [];
  for (var i = 1; i < rows.length; i++) {
    items.push({
      id: rows[i][0] ? rows[i][0].toString() : '',
      targetName: rows[i][1] ? rows[i][1].toString() : '',
      targetType: rows[i][2] ? rows[i][2].toString() : '',
      date: rows[i][3] ? rows[i][3].toString() : '',
      originalStartTime: rows[i][4] ? rows[i][4].toString() : '',
      originalEndTime: rows[i][5] ? rows[i][5].toString() : '',
      currentStartTime: rows[i][6] ? rows[i][6].toString() : '',
      currentEndTime: rows[i][7] ? rows[i][7].toString() : '',
      status: rows[i][8] ? rows[i][8].toString() : '',
      completionType: rows[i][9] ? rows[i][9].toString() : '',
      rescheduleCount: rows[i][10] ? parseInt(rows[i][10]) : 0,
      createdAt: rows[i][11] ? rows[i][11].toString() : '',
      completedAt: rows[i][12] ? rows[i][12].toString() : '',
      changeLog: parseJSON(rows[i][13]),
      synced: true // Set to true as it comes from the server
    });
  }
  return jsonResponse({ status: 'ok', data: items });
}
