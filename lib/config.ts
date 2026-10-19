// כל ההגדרות מגיעות ממשתני סביבה (Vercel → Settings → Environment Variables).
// סודות לא נכתבים בקוד.

const list = (v: string | undefined) =>
  (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export const config = {
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || '',
  authSecret: process.env.AUTH_SECRET || '',
  appUrl: process.env.APP_URL || '',

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  // מי רשאי להיכנס
  allowedDomain: (process.env.ALLOWED_DOMAIN || 'kiryatmoshe.co.il').toLowerCase(),
  allowedEmails: list(process.env.ALLOWED_EMAILS),
  adminEmails: list(process.env.ADMIN_EMAILS),

  // המסד המרכזי (גליון "תלמידים")
  centralDbId: process.env.CENTRAL_DB_ID || '1vZ_IvRGH2K2qfndwVDY2Ekr38VEFMMTLg8_0ezDxBtg',
  centralDbSheet: process.env.CENTRAL_DB_SHEET || 'תלמידים',
  // קובץ "ביקורת" הישן — לייבוא חד-פעמי של ההיסטוריה
  historySheetId: process.env.HISTORY_SHEET_ID || '1KCyCpqRNmstmisP8IVybd_1R7s5RXjaT3PsdZWBhndI',
  historySheetName: process.env.HISTORY_SHEET_NAME || 'מסד',

  firstReviewNumber: Number(process.env.FIRST_REVIEW_NUMBER || 155),
  passThreshold: Number(process.env.PASS_THRESHOLD || 0.85),
  timeZone: 'Asia/Jerusalem',

  // פיתוח מקומי בלבד — לעולם לא פעיל בפרודקשן
  devAuthEmail: process.env.NODE_ENV !== 'production' ? process.env.DEV_AUTH_EMAIL || '' : '',
  sheetsFixtureDir: process.env.NODE_ENV !== 'production' ? process.env.SHEETS_FIXTURE_DIR || '' : '',
  smsDryRun: process.env.SMS_DRY_RUN === '1',
};

export const STATUSES = ['נוכח', 'בישוב', 'חסר', 'לא ענה', 'נרשם'] as const;
export type Status = (typeof STATUSES)[number];
export const NO_ANSWER: Status = 'לא ענה';
export const REVIEW_TYPES = ['פנימית', 'חיצונית 00', 'חיצונית 02'] as const;
export const SESSIONS = ['בוקר', 'צהריים'] as const;
