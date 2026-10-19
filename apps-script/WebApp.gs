/****************************************************
 * אפליקציית ביקורת — צד שרת
 *
 * הקובץ מתווסף לפרויקט הסקריפט הקיים של הגיליון "ביקורת"
 * (תוספים ← Apps Script ← ➕ קובץ סקריפט חדש בשם WebApp).
 *
 * הוא לא מחליף שום דבר בקוד הקיים — רק משתמש בפונקציות שלו:
 *   buildExecList_, finalizeReview, updatePrintSheets, syncLocalDbFromCentral_,
 *   getExecRows_, getStudentMetaForDbRows_, sendBulkSmsWithMeta_, safeAdminReport_ ועוד.
 * כל השמות כאן מתחילים ב-app כדי לא להתנגש בשמות הקיימים.
 ****************************************************/

const APP_SMS_KEYS = ['SMS019_TOKEN', 'SMS019_USERNAME', 'SMS019_SOURCE', 'ADMIN_REPORT_PHONE'];

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('ביקורת נוכחות')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- עזרים ---------- */

function appSs_() {
  return SpreadsheetApp.getActive();
}

function appSheet_(name) {
  const sh = appSs_().getSheetByName(name);
  if (!sh) throw new Error(`גליון חסר: "${name}"`);
  return sh;
}

function appWithLock_(fn) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function appExecIdCol_(ex) {
  try { return findExecIdColumnForPrint_(ex); } catch (e) { return ensureExecIdColumn_(ex); }
}

function appStatusLine_() {
  return appSheet_(CONFIG.EXEC_SHEET).getRange(CONFIG.CELL_STATUS).getDisplayValue();
}

// אם הפעולה הקיימת כתבה ERROR בתא הסטטוס — מעבירים את השגיאה לאפליקציה
function appThrowIfStatusError_() {
  const line = appStatusLine_();
  const m = line.match(/\|\s*ERROR:\s*(.*)$/);
  if (m) throw new Error(m[1]);
  return line;
}

function appTimeText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TZ, 'HH:mm');
  return v === null || v === undefined ? '' : String(v);
}

/* ---------- הביקורת הפעילה (פורמט) ---------- */

function appGetState() {
  const ex = appSheet_(CONFIG.EXEC_SHEET);
  const idCol = appExecIdCol_(ex);
  const n = getActiveExecCount_(ex);
  const students = [];
  if (n) {
    const width = Math.max(idCol, CONFIG.COL_CHECK_START + CONFIG.CHECK_COLS - 1);
    const rows = ex.getRange(CONFIG.EXEC_START_ROW, 1, n, width).getValues();
    const ids = ex.getRange(CONFIG.EXEC_START_ROW, idCol, n, 1).getDisplayValues();
    rows.forEach((r, i) => {
      const name = normalizeText_(r[CONFIG.COL_NAME - 1]);
      const id = normalizeId_(ids[i][0]);
      if (!name || !id) return;
      const checks = r.slice(CONFIG.COL_CHECK_START - 1, CONFIG.COL_CHECK_START - 1 + CONFIG.CHECK_COLS);
      let idx = checks.findIndex(v => v === true);
      if (idx === -1) idx = CONFIG.NO_ANSWER_INDEX;
      students.push({ id, name, letter: String(r[CONFIG.COL_INITIAL - 1] || ''), status: CONFIG.STATUSES[idx] });
    });
  }
  return {
    log: ex.getRange(CONFIG.CELL_STATUS).getDisplayValue(),
    title: ex.getRange(CONFIG.CELL_TIMEOFDAY).getDisplayValue(),
    date: ex.getRange(CONFIG.CELL_DATE_HEB).getDisplayValue(),
    time: ex.getRange(CONFIG.CELL_TIME).getDisplayValue(),
    type: ex.getRange(CONFIG.CELL_TYPE).getDisplayValue(),
    types: CONFIG.TYPE_OPTIONS,
    statuses: CONFIG.STATUSES,
    noAnswer: CONFIG.STATUSES[CONFIG.NO_ANSWER_INDEX],
    students
  };
}

/** changes = [{id, status}] — נכתב לפי תעודת זהות, שורה שלמה של 5 צ'קבוקסים */
function appSetStatuses(changes) {
  return appWithLock_(() => {
    const ex = appSheet_(CONFIG.EXEC_SHEET);
    const idCol = appExecIdCol_(ex);
    const n = getActiveExecCount_(ex);
    if (!n) throw new Error('אין ביקורת פתוחה');
    const ids = ex.getRange(CONFIG.EXEC_START_ROW, idCol, n, 1).getDisplayValues();
    const rowById = {};
    ids.forEach((r, i) => { const id = normalizeId_(r[0]); if (id) rowById[id] = CONFIG.EXEC_START_ROW + i; });
    const missing = [];
    (changes || []).forEach(ch => {
      const row = rowById[normalizeId_(ch.id)];
      const idx = CONFIG.STATUSES.indexOf(ch.status);
      if (!row || idx === -1) { missing.push(ch.id); return; }
      const vals = Array(CONFIG.CHECK_COLS).fill(false);
      vals[idx] = true;
      ex.getRange(row, CONFIG.COL_CHECK_START, 1, CONFIG.CHECK_COLS).setValues([vals]);
    });
    return { ok: true, missing };
  });
}

function appSetMeta(meta) {
  appWithLock_(() => {
    const ex = appSheet_(CONFIG.EXEC_SHEET);
    if (meta.date !== undefined) ex.getRange(CONFIG.CELL_DATE_HEB).setValue(meta.date);
    if (meta.time !== undefined) ex.getRange(CONFIG.CELL_TIME).setNumberFormat('@').setValue(meta.time);
    if (meta.type !== undefined) ex.getRange(CONFIG.CELL_TYPE).setValue(meta.type);
  });
  return appGetState();
}

/** הכנת ביקורת — הפונקציה הקיימת: סנכרון מהמסד המרכזי + כולם "לא ענה" */
function appPrepare(timeOfDay, type) {
  if (timeOfDay !== 'בוקר' && timeOfDay !== 'צהריים') throw new Error('יש לבחור בוקר או צהריים');
  if (type) appSheet_(CONFIG.EXEC_SHEET).getRange(CONFIG.CELL_TYPE).setValue(type);
  buildExecList_(timeOfDay);
  appThrowIfStatusError_();
  return appGetState();
}

/** סגירת ביקורת — הפונקציה הקיימת, ואחריה עדכון גיליונות ההדפסה */
function appClose(meta) {
  if (meta) appSetMeta(meta);
  finalizeReview();
  appThrowIfStatusError_();
  let printError = '';
  try { updatePrintSheets(); } catch (e) { printError = e.message || String(e); }
  const h = appGetHistory();
  return { latest: h[0] || null, printError };
}

function appSync() {
  return appWithLock_(() => {
    const res = syncLocalDbFromCentral_(true);
    setStatus_('OK: הסנכרון הסתיים');
    return res;
  });
}

function appUpdatePrintSheets() {
  updatePrintSheets();
  appThrowIfStatusError_();
  return { ok: true };
}

/* ---------- SMS — אותו מנגנון של הקוד הקיים, בלי חלונות קופצים ---------- */

/** kind: 'start' | 'noanswer' */
function appSendSms(kind, password) {
  const isStart = kind === 'start';
  const needed = isStart ? CONFIG.SMS_PASSWORD_START : CONFIG.SMS_PASSWORD_OTHER;
  if (String(password || '').trim() !== needed) {
    safeAdminReport_('❌ סיסמה שגויה. לא בוצעה שליחה.');
    throw new Error('סיסמה שגויה. לא בוצעה שליחה.');
  }
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  const label = isStart ? 'סמס התחלה' : 'סמס לא ענו';
  try {
    setStatus_(`שולח ${label}…`);
    normalizeFormatSimple();
    const rows = getExecRows_(true);
    if (!rows.length) {
      setStatus_('OK: אין "לא ענה" לשליחה');
      return { sent: 0, missing: 0, errors: [], target: 0 };
    }
    safeAdminReport_(`↖️ מתחיל ${label} | יעד: ${rows.length}`);

    const ex = appSheet_(CONFIG.EXEC_SHEET);
    const mode = parseReviewMode_((ex.getRange(CONFIG.CELL_TYPE).getDisplayValue() || '').trim());
    const timeHHmm = ex.getRange(CONFIG.CELL_TIME).getDisplayValue() || '';
    const metaMap = getStudentMetaForDbRows_(rows.map(r => r.studentId));
    const res = sendBulkSmsWithMeta_(rows, metaMap, (r, meta) => {
      const en = normalizeLang_(meta.lang) === 'EN';
      if (mode.kind === 'external') return en ? buildSmsExternalTextEN_() : buildSmsExternalTextHE_();
      if (isStart) return en ? buildSmsStartTextEN_Internal_() : buildSmsStartTextHE_Internal_();
      return en ? buildSmsNoAnswerTextEN_Internal_(timeHHmm) : buildSmsNoAnswerTextHE_Internal_(timeHHmm);
    });

    safeAdminReport_(
      `${isStart ? '🟢' : '🔴'} דוח ${label}:\nנשלחו: ${res.sent}\nדולגו (חסר טלפון): ${res.missing}\n` +
      (res.errors.length ? `\nשגיאות:\n- ${res.errors.join('\n- ')}` : '\nללא שגיאות ✅')
    );
    setStatus_(`OK: ${label} נשלח (${res.sent})`);
    return { sent: res.sent, missing: res.missing, errors: res.errors, target: rows.length };
  } catch (e) {
    setStatus_(`ERROR: ${e.message}`);
    safeAdminReport_(`❌ שגיאה ב${label}:\n${e.message}`);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- הגדרות SMS (נשמרות ב-Script Properties, לא בקוד) ---------- */

function appCanEditSettings_() {
  const active = Session.getActiveUser().getEmail();
  const owner = Session.getEffectiveUser().getEmail();
  const extra = String(PropertiesService.getScriptProperties().getProperty('APP_ADMINS') || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!active && (active === owner || extra.indexOf(active.toLowerCase()) !== -1);
}

function appMask_(v, keep) {
  v = String(v || '');
  if (!v) return '';
  return v.length <= keep ? '•'.repeat(v.length) : '•'.repeat(Math.min(v.length - keep, 8)) + v.slice(-keep);
}

function appGetSettings() {
  const p = PropertiesService.getScriptProperties();
  return {
    canEdit: appCanEditSettings_(),
    user: Session.getActiveUser().getEmail(),
    token: appMask_(p.getProperty('SMS019_TOKEN'), 4),
    username: p.getProperty('SMS019_USERNAME') || '',
    source: p.getProperty('SMS019_SOURCE') || '',
    adminPhone: p.getProperty('ADMIN_REPORT_PHONE') || ''
  };
}

/** שדה ריק = לא משתנה. הטוקן לעולם לא נשלח חזרה לדפדפן. */
function appSaveSettings(s) {
  if (!appCanEditSettings_()) throw new Error('רק מי שפרס את האפליקציה יכול לשנות הגדרות SMS.');
  const p = PropertiesService.getScriptProperties();
  const map = { token: 'SMS019_TOKEN', username: 'SMS019_USERNAME', source: 'SMS019_SOURCE', adminPhone: 'ADMIN_REPORT_PHONE' };
  Object.keys(map).forEach(k => {
    const v = String((s && s[k]) || '').trim();
    if (v) p.setProperty(map[k], v);
  });
  return appGetSettings();
}

function appTestSms() {
  if (!appCanEditSettings_()) throw new Error('רק מי שפרס את האפליקציה יכול לשלוח הודעת בדיקה.');
  const admin = PropertiesService.getScriptProperties().getProperty('ADMIN_REPORT_PHONE');
  if (!admin) throw new Error('לא הוגדר טלפון מנהל.');
  sendSms019(toInternational972(admin), 'בדיקת מערכת ביקורת ✅');
  return { ok: true };
}

/* ---------- תוצאות (מסד) ---------- */

function appReviewsDesc_(db) {
  return getReviewColumns_(db).sort((a, b) => b.reviewNumber - a.reviewNumber);
}

function appGetHistory() {
  const db = appSheet_(CONFIG.DB_SHEET);
  const reviews = appReviewsDesc_(db);
  if (!reviews.length) return [];
  const block = db.getRange(1, 1, 12, db.getLastColumn()).getDisplayValues();
  return reviews.map(r => {
    const v = i => block[i][r.col - 1];
    const num = i => Number(String(v(i)).replace(/[^\d.-]/g, '')) || 0;
    return {
      col: r.col, num: r.reviewNumber, date: v(1), time: v(2), type: v(3), n: num(4),
      chaser: num(5), nirsham: num(6), totalMissing: num(7), bishuv: num(8), loAna: num(9),
      pct: v(10), result: v(11)
    };
  });
}

function appStudentCols_(db) {
  const info = findLocalHeaderInfo_(db);
  return {
    start: info.dataStartRow,
    id: info.columns[normalizeText_(CONFIG.LOCAL_HEADERS.ID)],
    last: info.columns[normalizeText_(CONFIG.LOCAL_HEADERS.LAST_NAME)],
    first: info.columns[normalizeText_(CONFIG.LOCAL_HEADERS.FIRST_NAME)]
  };
}

function appReadStudents_(db, extraCols) {
  const c = appStudentCols_(db);
  const n = db.getLastRow() - c.start + 1;
  if (n <= 0) return { c, rows: [] };
  const all = db.getRange(c.start, 1, n, db.getLastColumn()).getDisplayValues();
  const rows = all.map((r, i) => ({
    row: c.start + i,
    id: normalizeId_(r[c.id - 1]),
    last: normalizeText_(r[c.last - 1]),
    first: normalizeText_(r[c.first - 1]),
    vals: (extraCols || []).map(col => normalizeText_(r[col - 1]))
  })).filter(s => s.last || s.first);
  return { c, rows };
}

function appByName_(a, b) {
  return `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`, 'he');
}

function appGetReviewDetail(col) {
  const db = appSheet_(CONFIG.DB_SHEET);
  return appReadStudents_(db, [col]).rows
    .filter(s => s.vals[0])
    .map(s => ({ last: s.last, first: s.first, status: s.vals[0] }))
    .sort(appByName_);
}

function appGetStudents() {
  const db = appSheet_(CONFIG.DB_SHEET);
  return appReadStudents_(db, []).rows.map(s => ({ row: s.row, last: s.last, first: s.first })).sort(appByName_);
}

function appGetStudentHistory(row) {
  const db = appSheet_(CONFIG.DB_SHEET);
  const reviews = appReviewsDesc_(db);
  const lastCol = db.getLastColumn();
  const head = db.getRange(1, 1, 4, lastCol).getDisplayValues();
  const vals = db.getRange(row, 1, 1, lastCol).getDisplayValues()[0];
  return reviews.map(r => ({
    num: r.reviewNumber, date: head[1][r.col - 1], time: head[2][r.col - 1], type: head[3][r.col - 1],
    status: normalizeText_(vals[r.col - 1]) || 'נוכח'
  }));
}

/* ---------- הדפסה מתוך האפליקציה ---------- */

/** kind: cover | all | missing | bishuv | nirsham — תלמידי הביקורת הנוכחית בלבד, כמו בגיליונות ההדפסה */
function appGetPrintData(kind, count) {
  const db = appSheet_(CONFIG.DB_SHEET);
  const reviews = appReviewsDesc_(db).slice(0, count || 3);
  if (!reviews.length) return { reviews: [], rows: [] };
  const block = db.getRange(1, 1, 12, db.getLastColumn()).getDisplayValues();
  const summaries = reviews.map(r => block.map(row => row[r.col - 1]));
  let rows = [];
  if (kind !== 'cover') {
    const current = new Set(appGetState().students.map(s => s.id));
    rows = appReadStudents_(db, reviews.map(r => r.col)).rows
      .filter(s => s.id && current.has(s.id))
      .filter(s => {
        const st = s.vals[0];
        if (kind === 'missing') return st === 'חסר' || st === 'לא ענה';
        if (kind === 'bishuv') return st === 'בישוב';
        if (kind === 'nirsham') return st === 'נרשם';
        return true;
      })
      .sort(appByName_)
      .map(s => [s.last, s.first].concat(s.vals));
  }
  return { reviews: summaries, labels: getCoverHeaderLabels_(db, reviews), rows };
}
