import { LoginForm } from './lock';

/* מסך הכניסה — מוצג ישירות בכתובת הראשית (בלי הפניה לכתובת אחרת), כמו בשאר האפליקציות */

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

export function LoginScreen({ error }: { error?: string }) {
  return (
    <div className="login">
      <LoginForm error={error && <p className="err" role="alert">{ERRORS[error] || 'הכניסה נכשלה.'}</p>} />
    </div>
  );
}
