import postgres from 'postgres';
import { config } from './config';

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { __sql?: Sql; __schema?: Promise<void> };

function client(): Sql {
  if (!config.databaseUrl) throw new Error('DATABASE_URL לא מוגדר');
  if (!globalForDb.__sql) {
    const local = /localhost|127\.0\.0\.1|\/tmp|host=\//.test(config.databaseUrl);
    globalForDb.__sql = postgres(config.databaseUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // תואם ל-connection pooler של Neon
      ssl: local ? false : 'require',
      onnotice: () => {},
    });
  }
  return globalForDb.__sql;
}

const SCHEMA = `
create table if not exists reviews (
  id          serial primary key,
  number      integer unique,
  status      text not null default 'open' check (status in ('open','closed')),
  session     text not null default '',
  type        text not null default 'פנימית',
  date_heb    text not null default '',
  time        text not null default '',
  total       integer,
  present     integer,
  bishuv      integer,
  chaser      integer,
  lo_ana      integer,
  nirsham     integer,
  pct         numeric,
  passed      boolean,
  imported    boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  text,
  closed_at   timestamptz,
  closed_by   text
);
create unique index if not exists reviews_one_open on reviews ((status)) where status = 'open';

create table if not exists entries (
  review_id    integer not null references reviews(id) on delete cascade,
  student_id   text not null,
  last_name    text not null default '',
  first_name   text not null default '',
  phone        text not null default '',
  lang         text not null default '',
  talmud       text not null default '',
  study_status text not null default '',
  status       text not null,
  updated_at   timestamptz not null default now(),
  updated_by   text,
  primary key (review_id, student_id)
);
-- הערה קצרה לתלמיד "חסר" (למה לא נכח) — מוצגת במסך ובהדפסה
alter table entries add column if not exists note text not null default '';
create index if not exists entries_student on entries (student_id);
create index if not exists entries_updated on entries (review_id, updated_at);

create table if not exists sms_log (
  id          serial primary key,
  review_id   integer,
  kind        text not null,
  student_id  text,
  phone       text,
  ok          boolean not null,
  error       text,
  created_at  timestamptz not null default now(),
  sent_by     text
);
create index if not exists sms_log_review on sms_log (review_id, kind, created_at);

create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- מכשירים שמקבלים התראות (Web Push): rosh = המחשב של ראש הישיבה, admin = הטלפון של המזכירות
create table if not exists push_subs (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now()
);
create table if not exists push_devices (
  endpoint   text not null,
  role       text not null check (role in ('rosh','admin')),
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now(),
  primary key (endpoint, role)
);
-- העברה חד-פעמית של ההרשמות הישנות (כולן של ראש הישיבה)
with m as (delete from push_subs returning *)
insert into push_devices (endpoint, role, p256dh, auth, ua, created_at)
select endpoint, 'rosh', p256dh, auth, ua, created_at from m on conflict do nothing;

-- בקשות של ראש הישיבה לבצע ביקורת במועד מסוים
create table if not exists review_requests (
  id          serial primary key,
  at          timestamptz not null,          -- המועד הנוכחי (המבוקש / המוצע / המאושר)
  asked_at    timestamptz not null,          -- המועד שראש הישיבה ביקש במקור
  note        text not null default '',      -- הערה של ראש הישיבה
  reply       text not null default '',      -- הערה של המזכירות (עם הצעה למועד אחר)
  status      text not null check (status in ('pending','counter','approved','cancelled','done')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text,
  reminded_at timestamptz
);
create index if not exists review_requests_active on review_requests (status, at);

create table if not exists audit_log (
  id         serial primary key,
  at         timestamptz not null default now(),
  user_email text,
  action     text not null,
  detail     jsonb
);
`;

/** מחזיר חיבור למסד, ומוודא פעם אחת לכל שרת שהטבלאות קיימות */
export async function db(): Promise<Sql> {
  const sql = client();
  if (!globalForDb.__schema) {
    globalForDb.__schema = sql
      .begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(872341)`;
        await tx.unsafe(SCHEMA);
      })
      .then(() => undefined)
      .catch((e) => {
        globalForDb.__schema = undefined;
        throw e;
      });
  }
  await globalForDb.__schema;
  return sql;
}

export async function audit(user: string, action: string, detail?: unknown) {
  try {
    const sql = await db();
    await sql`insert into audit_log (user_email, action, detail) values (${user}, ${action}, ${sql.json((detail ?? null) as never)})`;
  } catch {
    // רישום ביומן לא אמור להפיל פעולה
  }
}
