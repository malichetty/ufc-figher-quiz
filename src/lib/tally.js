// Browser side of the quiz counter. Everything here fails quietly: no counter
// shown is the fallback, never an error for the person taking the quiz.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const TURNSTILE_JS = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export async function fetchTally(fighter) {
  if (!SITE_KEY) return null;
  try {
    const q = fighter ? `?f=${encodeURIComponent(fighter.slug)}&t=${fighter.type}` : '';
    const res = await fetch(`/api/tally${q}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.enabled ? data : null;
  } catch {
    return null;
  }
}

let widget = null;
let pending = null;
const settle = (token) => {
  pending?.(token);
  pending = null;
};

// Load the invisible bot check early (when the quiz starts) so the token is
// quick to get at the end.
export function prepareBotCheck() {
  if (!SITE_KEY || widget) return;
  widget = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = TURNSTILE_JS;
    s.async = true;
    s.onload = () => {
      // Not hidden: in Managed mode Turnstile may need a tap, and
      // 'interaction-only' shows the widget only then.
      const el = document.createElement('div');
      el.className = 'bot-check';
      document.body.appendChild(el);
      const id = window.turnstile.render(el, {
        sitekey: SITE_KEY,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token) => settle(token),
        'error-callback': () => settle(null),
      });
      resolve({ el, id });
    };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

async function getToken() {
  const w = widget && (await widget);
  if (!w) return null;
  settle(null); // an earlier wait that never finished gives up its turn
  return new Promise((resolve) => {
    // Reset after every outcome so a solved or abandoned check never stays on
    // screen over the result.
    const done = (token) => {
      clearTimeout(timer);
      window.turnstile.reset(w.id);
      resolve(token);
    };
    const mine = (token) => done(token);
    const timer = setTimeout(() => {
      if (pending === mine) pending = null;
      done(null);
    }, 30000);
    pending = mine;
    window.turnstile.reset(w.id);
    window.turnstile.execute(w.el);
  });
}

export async function recordTally(fighter) {
  try {
    const token = await getToken();
    if (!token) return null;
    const res = await fetch('/api/tally', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: fighter.slug, type: fighter.type, token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.enabled ? data : null;
  } catch {
    return null;
  }
}
