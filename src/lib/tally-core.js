// The "people who took the quiz" counter (PRD decision 8, FR-10). Pure logic
// shared by functions/api/tally.js and the tests; storage is Cloudflare D1.
//
// Guardrails: a write needs a valid Turnstile token (single use, so no
// replays), only known fighter/type keys can be written, one quiz is one D1
// batch, and a daily cap stops counting (and the D1 bill) during an attack.
export const DAILY_CAP = 20000;
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

const bump = (db, key) =>
  db.prepare('INSERT INTO tally (key, n) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n').bind(key);

async function readCounts(db, keys) {
  const marks = keys.map((_, i) => `?${i + 1}`).join(', ');
  const { results } = await db
    .prepare(`SELECT key, n FROM tally WHERE key IN (${marks})`)
    .bind(...keys)
    .all();
  const map = Object.fromEntries(results.map((r) => [r.key, r.n]));
  return keys.map((k) => map[k] || 0);
}

// GET /api/tally?f=<slug>&t=<type>: totals for the intro and result pages.
export async function handleGet({ env, url, isKnown }) {
  if (!env.DB) return json({ enabled: false });
  const slug = url.searchParams.get('f');
  const type = url.searchParams.get('t');
  const keys = ['total'];
  if (slug && type && isKnown(slug, type)) keys.push(`fighter:${slug}`, `type:${type}`);
  const [total, fighter, typeCount] = await readCounts(env.DB, keys);
  return json(
    { enabled: true, total, fighter: fighter || 0, type: typeCount || 0 },
    200,
    { 'Cache-Control': 'public, max-age=60' },
  );
}

// POST /api/tally {slug, type, token}: count one finished quiz.
export async function handlePost({ env, request, isKnown, fetchImpl = fetch, today }) {
  if (!env.DB || !env.TURNSTILE_SECRET) return json({ enabled: false }, 503);
  if (Number(request.headers.get('Content-Length') || 0) > 2048) return json({ error: 'too large' }, 413);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const { slug, type, token } = body || {};
  if (typeof slug !== 'string' || typeof type !== 'string' || !isKnown(slug, type)) {
    return json({ error: 'unknown result' }, 400);
  }
  if (typeof token !== 'string' || !token || token.length > 4096) return json({ error: 'no token' }, 403);

  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET);
  form.set('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.set('remoteip', ip);
  let verdict;
  try {
    const res = await fetchImpl(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
    verdict = await res.json();
  } catch {
    return json({ error: 'verify failed' }, 503);
  }
  if (!verdict?.success) return json({ error: 'bot check failed' }, 403);

  const day = await bump(env.DB, `day:${today}`).first('n');
  if (day > DAILY_CAP) return json({ error: 'daily cap' }, 429);

  const [total, fighter, typeCount] = await env.DB.batch([
    bump(env.DB, 'total'),
    bump(env.DB, `fighter:${slug}`),
    bump(env.DB, `type:${type}`),
  ]);
  const n = (r) => r?.results?.[0]?.n || 0;
  return json({ enabled: true, total: n(total), fighter: n(fighter), type: n(typeCount) });
}
