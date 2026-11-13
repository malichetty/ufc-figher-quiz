// Browser side of the quiz counter. Everything here fails quietly: no counter
// shown is the fallback, never an error for the person taking the quiz.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const TURNSTILE_JS = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export async function fetchTally(fighter) {
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
      const el = document.createElement('div');
      el.style.display = 'none';
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
  return new Promise((resolve) => {
    const timer = setTimeout(() => settle(null), 8000);
    pending = (token) => {
      clearTimeout(timer);
      resolve(token);
    };
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
