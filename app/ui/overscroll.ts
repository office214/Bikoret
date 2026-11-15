'use client';

import { useEffect } from 'react';

/*
 * קפיצה עדינה בקצה הגלילה.
 * הקפיצה המובנית של הטלפון (בעיקר באייפון) חזקה מדי ואי אפשר לשנות את העוצמה שלה — לכן היא מבוטלת
 * ב-CSS (overscroll-behavior), ובמקומה:
 *   • משיכה מעבר לקצה — התוכן זז עד ~12 פיקסלים (בהתנגדות הולכת וגדלה) וחוזר כשעוזבים;
 *   • גלילה מהירה שמגיעה לקצה — "נקישה" קטנה של כמה פיקסלים.
 * הרכיב שזז הוא <main> בלבד; הכותרת והתפריט התחתון לא זזים.
 */
const MAX = 12;

export function useSoftOverscroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const main = () => document.querySelector('main') as HTMLElement | null;
    const atTop = () => window.scrollY <= 0;
    const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
    const locked = () => document.body.style.overflow === 'hidden'; // חלון פתוח

    let lastY = 0, pull = 0, dir = 0;
    const set = (px: number) => { const m = main(); if (m) { m.style.transition = 'none'; m.style.transform = px ? `translateY(${px}px)` : ''; } };
    const release = () => {
      const m = main();
      if (m && pull) { m.style.transition = 'transform .28s cubic-bezier(.2,.8,.3,1)'; m.style.transform = ''; }
      pull = 0; dir = 0;
    };
    const start = (e: TouchEvent) => { lastY = e.touches[0].clientY; pull = 0; dir = 0; };
    const move = (e: TouchEvent) => {
      if (locked() || e.touches.length !== 1) return;
      const y = e.touches[0].clientY, dy = y - lastY;
      lastY = y;
      // משיכה למטה כשנמצאים בראש הדף, או למעלה כשנמצאים בסוף
      const d = dy > 0 && atTop() ? 1 : dy < 0 && atBottom() ? -1 : 0;
      if (d && (!dir || d === dir)) { dir = d; pull += Math.abs(dy); }
      else if (dir && Math.sign(dy) === -dir) pull = Math.max(0, pull - Math.abs(dy)); // חוזרים אחורה
      else if (!d) { if (pull) release(); return; }
      if (dir) set(dir * MAX * (1 - Math.exp(-pull / 90)));
    };

    // גלילה מהירה (אחרי שעזבו את האצבע) שמגיעה לקצה
    let sy = window.scrollY, st = performance.now(), v = 0;
    const onScroll = () => {
      const now = performance.now(), y = window.scrollY;
      const dt = now - st;
      if (dt > 0) v = (y - sy) / dt;
      sy = y; st = now;
      if (pull || locked()) return;
      const hitBottom = v > 0.8 && atBottom(), hitTop = v < -0.8 && atTop();
      if (!hitBottom && !hitTop) return;
      const m = main();
      if (!m?.animate) return;
      const a = Math.min(8, 2 + Math.abs(v) * 2) * (hitBottom ? -1 : 1);
      m.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${a}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: 'ease-out' });
      v = 0;
    };

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', release, { passive: true });
    document.addEventListener('touchcancel', release, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', release);
      document.removeEventListener('touchcancel', release);
      window.removeEventListener('scroll', onScroll);
      const m = main(); if (m) { m.style.transform = ''; m.style.transition = ''; }
    };
  }, []);
}
