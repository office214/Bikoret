/**
 * אפליקציית ביקורת נוכחות — ישיבה גבוהה
 * עובדת ישירות על הגיליון "ביקורת" (פורמט / מסד / גיליונות הדפסה).
 * מבנה הגיליונות נשמר כמו שהוא, כך שהסקריפט הקיים בגיליון ממשיך לעבוד במקביל.
 */

// מזהה קובץ "ביקורת" בגוגל דרייב
var SPREADSHEET_ID = '1KCyCpqRNmstmisP8IVybd_1R7s5RXjaT3PsdZWBhndI';

var SHEET_FORMAT = 'פורמט';
var SHEET_DB = 'מסד';

// פורמט: שורה 4 ומטה = תלמידים. עמודות: A אות, B שם, C-G סטטוסים, H ת"ז
var FMT_FIRST_ROW = 4;
var FMT_COL_STATUS = 3;
var STATUSES = ['נוכח', 'בישוב', 'חסר', 'לא ענה', 'נרשם'];
var FMT_COL_ID = 8;

// מסד: שורות 1-12 סיכום, שורה 13 כותרת, 14 ומטה תלמידים. עמודה F = הביקורת האחרונה
var DB_FIRST_COL = 6;
var DB_HEADER_ROW = 13;
var DB_FIRST_ROW = 14;
var DB_SUMMARY_LABELS = ["מס' ביקורת", 'תאריך ביקורת', 'שעת ביקורת', 'סוג ביקורת', "מס' תלמידים",
  'חסר', 'נרשם', 'סה"כ חסרים', 'בישוב', 'לא ענה', 'אחוז נוכחות', 'עובר/נכשל'];

var PASS_THRESHOLD = 0.85;
var REVIEW_TYPES = ['פנימית', 'חיצונית 00', 'חיצונית 02'];

var PRINT_SHEETS = {
  cover: 'הדפסה שער',
  all: 'הדפסה כללי',
  missing: 'הדפסה חסר/לא ענה',
  bishuv: 'הדפסה בישוב',
  nirsham: 'הדפסה נרשם'
};

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('ביקורת נוכחות')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- עזרים ---------- */

function ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function sheet_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  // שמות עם "/" עלולים להשתנות — חיפוש גמיש
  var norm = String(name).replace(/[\/\s]/g, '');
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getName().replace(/[\/\s]/g, '') === norm) return all[i];
  }
  throw new Error('לא נמצא גיליון: ' + name);
}

function withLock_(fn) {
  var lock = LockService.getDocumentLock() || LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function fmtTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  return v === null || v === undefined ? '' : String(v);
}

function cellText_(v) {
  if (v instanceof Date) return fmtTime_(v);
  return v === null || v === undefined ? '' : String(v);
}

function statusFromRow_(row) {
  for (var i = 0; i < STATUSES.length; i++) {
    if (row[FMT_COL_STATUS - 1 + i] === true) return STATUSES[i];
  }
  return '';
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function fmtLastRow_(sh) {
  var last = sh.getLastRow();
  if (last < FMT_FIRST_ROW) return FMT_FIRST_ROW - 1;
  var ids = sh.getRange(FMT_FIRST_ROW, FMT_COL_ID, last - FMT_FIRST_ROW + 1, 1).getValues();
  var r = ids.length;
  while (r > 0 && (ids[r - 1][0] === '' || ids[r - 1][0] === false || ids[r - 1][0] === null)) r--;
  return FMT_FIRST_ROW + r - 1;
}

/* ---------- ביקורת פעילה (גיליון פורמט) ---------- */

/** מצב הביקורת הנוכחית: פרטים + רשימת תלמידים וסטטוס */
function getState() {
  var sh = sheet_(SHEET_FORMAT);
  var head = sh.getRange(1, 1, 2, 8).getValues();
  var lastRow = fmtLastRow_(sh);
  var students = [];
  if (lastRow >= FMT_FIRST_ROW) {
    var rows = sh.getRange(FMT_FIRST_ROW, 1, lastRow - FMT_FIRST_ROW + 1, FMT_COL_ID).getValues();
    for (var i = 0; i < rows.length; i++) {
      var id = String(rows[i][FMT_COL_ID - 1] || '').trim();
      if (!id || id === 'false') continue;
      students.push({
        row: FMT_FIRST_ROW + i,
        id: id,
        letter: String(rows[i][0] || ''),
        name: String(rows[i][1] || ''),
        status: statusFromRow_(rows[i])
      });
    }
  }
  return {
    log: cellText_(head[0][0]),
    date: cellText_(head[0][2]),
    time: fmtTime_(head[0][5]),
    type: cellText_(head[0][6]),
    title: cellText_(head[1][1]),
    students: students,
    statuses: STATUSES,
    types: REVIEW_TYPES,
    serverTime: now_()
  };
}

/**
 * עדכון סטטוס לתלמידים. changes = [{id, status}]
 * הסטטוס נכתב לפי ת"ז (לא לפי מספר שורה), כדי שלא ייכתב לתלמיד הלא נכון.
 */
function setStatuses(changes) {
  return withLock_(function () {
    var sh = sheet_(SHEET_FORMAT);
    var lastRow = fmtLastRow_(sh);
    if (lastRow < FMT_FIRST_ROW) throw new Error('אין ביקורת פתוחה');
    var ids = sh.getRange(FMT_FIRST_ROW, FMT_COL_ID, lastRow - FMT_FIRST_ROW + 1, 1).getValues();
    var rowById = {};
    for (var i = 0; i < ids.length; i++) rowById[String(ids[i][0]).trim()] = FMT_FIRST_ROW + i;
    var missing = [];
    changes.forEach(function (ch) {
      var row = rowById[String(ch.id)];
      if (!row) { missing.push(ch.id); return; }
      var vals = STATUSES.map(function (s) { return s === ch.status; });
      sh.getRange(row, FMT_COL_STATUS, 1, STATUSES.length).setValues([vals]);
    });
    return { ok: true, missing: missing };
  });
}

/** עדכון פרטי הביקורת (תאריך, שעה, סוג) בשורה 1 של פורמט */
function setMeta(meta) {
  return withLock_(function () {
    var sh = sheet_(SHEET_FORMAT);
    if (meta.date !== undefined) sh.getRange(1, 3).setValue(meta.date);
    if (meta.time !== undefined) sh.getRange(1, 6).setValue(meta.time);
    if (meta.type !== undefined) sh.getRange(1, 7).setValue(meta.type);
    return getState();
  });
}

/**
 * הכנת ביקורת חדשה: רשימת התלמידים הפעילים מהמסד, כולם "לא ענה".
 * session: 'boker' | 'tzohorayim'
 */
function prepareReview(session, meta) {
  return withLock_(function () {
    var db = sheet_(SHEET_DB);
    var lastDb = db.getLastRow();
    var rows = db.getRange(DB_FIRST_ROW, 1, Math.max(lastDb - DB_FIRST_ROW + 1, 1), 5).getValues();
    var allowed = { 'תלמיד': true };
    allowed[session === 'tzohorayim' ? 'חצי יום צהריים' : 'חצי יום בוקר'] = true;

    var list = [];
    var seen = {};
    rows.forEach(function (r) {
      var id = String(r[0] || '').trim();
      var st = String(r[2] || '').trim();
      if (!id || !allowed[st] || seen[id]) return;
      seen[id] = true;
      var last = String(r[3] || '').trim();
      var first = String(r[4] || '').trim();
      list.push({ id: id, last: last, name: (last + ' ' + first).trim() });
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name, 'he'); });

    var sh = sheet_(SHEET_FORMAT);
    var oldLast = Math.max(fmtLastRow_(sh), sh.getLastRow());
    if (oldLast >= FMT_FIRST_ROW) {
      sh.getRange(FMT_FIRST_ROW, 1, oldLast - FMT_FIRST_ROW + 1, 2).clearContent();
      sh.getRange(FMT_FIRST_ROW, FMT_COL_STATUS, oldLast - FMT_FIRST_ROW + 1, STATUSES.length).setValue(false);
      sh.getRange(FMT_FIRST_ROW, FMT_COL_ID, oldLast - FMT_FIRST_ROW + 1, 1).clearContent();
    }
    if (list.length) {
      var n = list.length;
      if (sh.getMaxRows() < FMT_FIRST_ROW + n - 1) {
        sh.insertRowsAfter(sh.getMaxRows(), FMT_FIRST_ROW + n - 1 - sh.getMaxRows());
      }
      sh.getRange(FMT_FIRST_ROW, 1, n, 2).setValues(list.map(function (s) { return [s.last.charAt(0), s.name]; }));
      var statusRange = sh.getRange(FMT_FIRST_ROW, FMT_COL_STATUS, n, STATUSES.length);
      statusRange.insertCheckboxes();
      statusRange.setValues(list.map(function () { return STATUSES.map(function (s) { return s === 'לא ענה'; }); }));
      sh.getRange(FMT_FIRST_ROW, FMT_COL_ID, n, 1).setNumberFormat('@')
        .setValues(list.map(function (s) { return [s.id]; }));
      // מוני הסטטוסים בשורה 3
      var endRow = Math.max(FMT_FIRST_ROW + n - 1, 156);
      var cols = ['C', 'D', 'E', 'F', 'G'];
      sh.getRange(3, FMT_COL_STATUS, 1, 5).setFormulas([cols.map(function (c) {
        return '=COUNTIF(' + c + FMT_FIRST_ROW + ':' + c + endRow + ',TRUE)';
      })]);
    }
    sh.getRange(2, 2).setValue(session === 'tzohorayim' ? 'ביקורת צהריים' : 'ביקורת בוקר');
    meta = meta || {};
    sh.getRange(1, 3).setValue(meta.date || '');
    sh.getRange(1, 6).setValue(meta.time || '');
    sh.getRange(1, 7).setValue(meta.type || 'פנימית');
    sh.getRange(1, 1).setValue(now_() + ' | OK: הוכנה ' + (session === 'tzohorayim' ? 'ביקורת צהריים' : 'ביקורת בוקר') + ' (' + list.length + ' תלמידים)');
    return getState();
  });
}

/** סגירת ביקורת: הוספת עמודה חדשה במסד עם התוצאות ועדכון גיליונות ההדפסה */
function closeReview(meta) {
  var result = withLock_(function () {
    var state = getState();
    if (!state.students.length) throw new Error('אין תלמידים בביקורת');
    meta = meta || {};
    var date = meta.date || state.date;
    var time = meta.time || state.time || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm');
    var type = meta.type || state.type || 'פנימית';
    if (!date) throw new Error('חסר תאריך ביקורת');

    var counts = {};
    STATUSES.forEach(function (s) { counts[s] = 0; });
    state.students.forEach(function (s) { counts[s.status || 'לא ענה']++; });
    var n = state.students.length;
    var pct = (n - counts['חסר'] - counts['נרשם'] - counts['לא ענה']) / n;

    var db = sheet_(SHEET_DB);
    var prevNum = Number(db.getRange(1, DB_FIRST_COL).getValue()) || 0;
    db.insertColumnBefore(DB_FIRST_COL);
    var num = prevNum + 1;
    var summary = [num, date, time, type, n, counts['חסר'], counts['נרשם'], counts['חסר'] + counts['נרשם'],
      counts['בישוב'], counts['לא ענה'], pct, pct >= PASS_THRESHOLD ? 'עובר' : 'נכשל', date];
    db.getRange(1, DB_FIRST_COL, summary.length, 1).setValues(summary.map(function (v) { return [v]; }));
    db.getRange(3, DB_FIRST_COL).setNumberFormat('@').setValue(time);
    db.getRange(11, DB_FIRST_COL).setNumberFormat('0.00%');

    var lastDb = db.getLastRow();
    var ids = db.getRange(DB_FIRST_ROW, 1, lastDb - DB_FIRST_ROW + 1, 1).getValues();
    var statusById = {};
    state.students.forEach(function (s) { statusById[s.id] = s.status || 'לא ענה'; });
    var found = {};
    var out = ids.map(function (r) {
      var id = String(r[0] || '').trim();
      if (id && statusById[id] !== undefined && !found[id]) {
        found[id] = true;
        return [statusById[id] === 'נוכח' ? '' : statusById[id]];
      }
      return [''];
    });
    db.getRange(DB_FIRST_ROW, DB_FIRST_COL, out.length, 1).setValues(out);
    var notFound = state.students.filter(function (s) { return !found[s.id]; }).map(function (s) { return s.name; });

    var fmt = sheet_(SHEET_FORMAT);
    fmt.getRange(1, 1).setValue(now_() + ' | OK: נסגרה ביקורת #' + num);
    return { num: num, pct: pct, passed: pct >= PASS_THRESHOLD, counts: counts, n: n, notFound: notFound };
  });
  try {
    updatePrintSheets();
  } catch (e) {
    result.printError = String(e && e.message || e);
  }
  return result;
}

/* ---------- היסטוריה (גיליון מסד) ---------- */

function dbLastCol_(db) {
  var row = db.getRange(1, DB_FIRST_COL, 1, Math.max(db.getLastColumn() - DB_FIRST_COL + 1, 1)).getValues()[0];
  var c = row.length;
  while (c > 0 && (row[c - 1] === '' || row[c - 1] === null)) c--;
  return DB_FIRST_COL + c - 1;
}

/** סיכום כל הביקורות (שורות 1-12 במסד), מהחדשה לישנה */
function getHistory() {
  var db = sheet_(SHEET_DB);
  var lastCol = dbLastCol_(db);
  if (lastCol < DB_FIRST_COL) return [];
  var vals = db.getRange(1, DB_FIRST_COL, 12, lastCol - DB_FIRST_COL + 1).getValues();
  var list = [];
  for (var c = 0; c < vals[0].length; c++) {
    list.push({
      col: DB_FIRST_COL + c,
      num: cellText_(vals[0][c]),
      date: cellText_(vals[1][c]),
      time: fmtTime_(vals[2][c]),
      type: cellText_(vals[3][c]),
      n: Number(vals[4][c]) || 0,
      chaser: Number(vals[5][c]) || 0,
      nirsham: Number(vals[6][c]) || 0,
      totalMissing: Number(vals[7][c]) || 0,
      bishuv: Number(vals[8][c]) || 0,
      loAna: Number(vals[9][c]) || 0,
      pct: typeof vals[10][c] === 'number' ? vals[10][c] : null,
      result: cellText_(vals[11][c])
    });
  }
  return list;
}

/** פירוט ביקורת אחת: מי לא היה נוכח */
function getReviewDetail(col) {
  var db = sheet_(SHEET_DB);
  var lastDb = db.getLastRow();
  var n = lastDb - DB_FIRST_ROW + 1;
  var info = db.getRange(DB_FIRST_ROW, 1, n, 5).getValues();
  var st = db.getRange(DB_FIRST_ROW, col, n, 1).getValues();
  var out = [];
  for (var i = 0; i < n; i++) {
    var v = cellText_(st[i][0]).trim();
    if (!v) continue;
    out.push({ id: cellText_(info[i][0]), last: cellText_(info[i][3]), first: cellText_(info[i][4]), status: v });
  }
  out.sort(function (a, b) { return (a.last + ' ' + a.first).localeCompare(b.last + ' ' + b.first, 'he'); });
  return out;
}

/** רשימת כל התלמידים במסד (לחיפוש היסטוריה אישית) */
function getStudents() {
  var db = sheet_(SHEET_DB);
  var lastDb = db.getLastRow();
  var info = db.getRange(DB_FIRST_ROW, 1, lastDb - DB_FIRST_ROW + 1, 5).getValues();
  var out = [];
  info.forEach(function (r, i) {
    if (!r[3] && !r[4]) return;
    out.push({ row: DB_FIRST_ROW + i, id: cellText_(r[0]), status: cellText_(r[2]), last: cellText_(r[3]), first: cellText_(r[4]) });
  });
  return out;
}

/** היסטוריה אישית של תלמיד לפי שורה במסד */
function getStudentHistory(row) {
  var db = sheet_(SHEET_DB);
  var lastCol = dbLastCol_(db);
  if (lastCol < DB_FIRST_COL) return [];
  var width = lastCol - DB_FIRST_COL + 1;
  var head = db.getRange(1, DB_FIRST_COL, 4, width).getValues();
  var vals = db.getRange(row, DB_FIRST_COL, 1, width).getValues()[0];
  var out = [];
  for (var c = 0; c < width; c++) {
    out.push({ num: cellText_(head[0][c]), date: cellText_(head[1][c]), time: fmtTime_(head[2][c]),
      type: cellText_(head[3][c]), status: cellText_(vals[c]).trim() || 'נוכח' });
  }
  return out;
}

/* ---------- הדפסה ---------- */

/**
 * נתונים להדפסה: count הביקורות האחרונות, לתלמידי הביקורת הנוכחית בלבד (כמו בגיליונות ההדפסה).
 * kind: all | missing | bishuv | nirsham | cover
 */
function getPrintData(kind, count) {
  count = count || 3;
  var db = sheet_(SHEET_DB);
  var lastCol = dbLastCol_(db);
  var width = Math.min(count, Math.max(lastCol - DB_FIRST_COL + 1, 0));
  if (!width) return { reviews: [], rows: [] };
  var head = db.getRange(1, DB_FIRST_COL, 12, width).getValues();
  var reviews = [];
  for (var c = 0; c < width; c++) {
    reviews.push(head.map(function (r, i) {
      if (i === 2) return fmtTime_(r[c]);
      if (i === 10 && typeof r[c] === 'number') return Math.round(r[c] * 10000) / 100 + '%';
      return cellText_(r[c]);
    }));
  }
  var rows = [];
  if (kind !== 'cover') {
    var current = {};
    getState().students.forEach(function (s) { current[s.id] = true; });
    var lastDb = db.getLastRow();
    var n = lastDb - DB_FIRST_ROW + 1;
    var info = db.getRange(DB_FIRST_ROW, 1, n, 5).getValues();
    var st = db.getRange(DB_FIRST_ROW, DB_FIRST_COL, n, width).getValues();
    for (var i = 0; i < n; i++) {
      var id = cellText_(info[i][0]).trim();
      if (!id || !current[id]) continue;
      var s0 = cellText_(st[i][0]).trim();
      if (kind === 'missing' && s0 !== 'חסר' && s0 !== 'לא ענה') continue;
      if (kind === 'bishuv' && s0 !== 'בישוב') continue;
      if (kind === 'nirsham' && s0 !== 'נרשם') continue;
      rows.push([cellText_(info[i][3]), cellText_(info[i][4])].concat(st[i].map(function (v) { return cellText_(v).trim(); })));
    }
    rows.sort(function (a, b) { return (a[0] + ' ' + a[1]).localeCompare(b[0] + ' ' + b[1], 'he'); });
  }
  return { reviews: reviews, labels: DB_SUMMARY_LABELS, rows: rows };
}

/** עדכון גיליונות ההדפסה בקובץ (ערכים קבועים לפי 3 הביקורות האחרונות) */
function updatePrintSheets() {
  var kinds = ['all', 'missing', 'bishuv', 'nirsham'];
  var latest = null;
  kinds.forEach(function (kind) {
    var data = getPrintData(kind, 3);
    if (!data.reviews.length) return;
    latest = data.reviews[0];
    var sh = sheet_(PRINT_SHEETS[kind]);
    var w = 2 + data.reviews.length;
    var titles = {
      all: 'כלל הישיבה (' + latest[4] + ')',
      missing: 'חסר (' + latest[5] + ') לא ענה (' + latest[9] + ')',
      bishuv: 'בישוב (' + latest[8] + ')',
      nirsham: 'נרשם (' + latest[6] + ')'
    };
    var maxRows = sh.getMaxRows();
    sh.getRange(2, 1, maxRows - 1, Math.max(sh.getMaxColumns(), 5)).clearContent();
    sh.getRange(1, 1).setValue(titles[kind]);
    var header = [];
    for (var r = 1; r < 12; r++) {
      header.push(['', DB_SUMMARY_LABELS[r]].concat(data.reviews.map(function (rv) { return rv[r]; })));
    }
    sh.getRange(2, 1, header.length, w).setNumberFormat('@').setValues(header);
    sh.getRange(13, 1, 1, w).setValues([['שם משפחה', 'שם פרטי'].concat(data.reviews.map(function (rv) { return rv[1]; }))]);
    if (data.rows.length) {
      if (sh.getMaxRows() < 13 + data.rows.length) sh.insertRowsAfter(sh.getMaxRows(), 13 + data.rows.length - sh.getMaxRows());
      sh.getRange(14, 1, data.rows.length, w).setValues(data.rows);
    }
  });
  var cover = getPrintData('cover', 3);
  if (cover.reviews.length) {
    var sh = sheet_(PRINT_SHEETS.cover);
    sh.getRange(2, 1).setValue('תוצאות ביקורת (' + cover.reviews[0][4] + ' תלמידים)');
    sh.getRange(5, 2, 12, 4).clearContent();
    var rows = DB_SUMMARY_LABELS.map(function (label, r) {
      var line = [label].concat(cover.reviews.map(function (rv) { return rv[r]; }));
      while (line.length < 4) line.push('');
      return line;
    });
    sh.getRange(5, 2, rows.length, 4).setNumberFormat('@').setValues(rows);
  }
  return { ok: true };
}
