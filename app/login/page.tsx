import { GoogleLink, LoginForm } from '../ui/lock';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  password: 'סיסמה שגויה.',
  name: 'יש להקליד שם.',
  locked: 'יותר מדי ניסיונות שגויים. נסה שוב בעוד 15 דקות.',
  setup: 'הכניסה עם גוגל לא הוגדרה.',
  forbidden: 'כניסה עם Google מותרת רק למנהלי המערכת.',
  scope: 'לא התקבלה הרשאת קריאה לגיליונות. נסה שוב ואשר את כל ההרשאות.',
  state: 'פג תוקף הבקשה. נסה שוב.',
  denied: 'הכניסה בוטלה.',
  token: 'הכניסה נכשלה. נסה שוב.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login">
      <LoginForm>
        <h1>ביקורת נוכחות</h1>
        <p className="sub">הקלד את שמך ואת סיסמת הכניסה</p>
        <label className="f" style={{ textAlign: 'right' }}>שם
          <input name="name" autoComplete="name" required maxLength={40} defaultValue="" />
        </label>
        <label className="f" style={{ textAlign: 'right', marginTop: 10 }}>סיסמה
          <input name="password" type="password" autoComplete="current-password" required autoFocus />
        </label>
        <button className="btn solid" type="submit" style={{ width: '100%', marginTop: 16 }}>כניסה</button>
        {error && <p className="err" role="alert">{ERRORS[error] || 'הכניסה נכשלה.'}</p>}
        <p className="sub" style={{ marginTop: 18 }}><GoogleLink /></p>
      </LoginForm>
    </div>
  );
}
