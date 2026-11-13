// The "people who took the quiz" counter (PRD decision 8, FR-10). Pure logic
// shared by functions/api/tally.js and the tests; storage is Cloudflare D1.
//
// Guardrails: a write needs a valid Turnstile token (single use, so no
// replays), only known fighter/type keys can be written, one quiz is one D1
// batch, and a daily cap stops counting (and the D1 bill) during an attack.
// Five D1 row writes per quiz: the cap keeps a day under 75,000 writes.
export const DAILY_CAP = 15000;
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

const bump = (db, key) =>
  db.prepare('INSERT INTO tally (key, n) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n').bind(key);

// Bumps the day's row only while it is under the cap, so a capped day costs no
// further writes. Returns null once the cap is reached.
const bumpDay = (db, key, cap) =>
  db
    .prepare('INSERT INTO tally (key, n) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1 WHERE n < ?2 RETURNING n')
    .bind(key, cap)
    .first('n');

export const enabled = (env) => Boolean(env.DB && env.TURNSTILE_SECRET);

// The only GET URLs worth caching: the total, or a known fighter and type.
// Everything else maps onto one of these, so junk query strings can't make
// every request a cache miss.
export function canonicalGetUrl(url, isKnown) {
  const out = new URL('/api/tally', url.origin);
  const slug = url.searchParams.get('f');
  const type = url.searchParams.get('t');
  if (slug && type && isKnown(slug, type)) {
    out.searchParams.set('f', slug);
    out.searchParams.set('t', type);
  }
  return out;
}

const BODY_MAX = 8192;

// Reads at most BODY_MAX bytes whatever Content-Length says (a chunked body
// has none), so an oversized POST is refused before it is buffered.
async function readJsonCapped(request) {
  if (Number(request.headers.get('Content-Length') || 0) > BODY_MAX) return { tooLarge: true };
  if (!request.body) return { value: null };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_MAX) {
      await reader.cancel();
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { bad: true };
  }
}

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
  if (!enabled(env)) return json({ enabled: false });
  const slug = url.searchParams.get('f');
  const type = url.searchParams.get('t');
  // 'typed' counts only quizzes recorded with a type; 'total' also carries the
  // 62 quizzes the old counter saw, which have no type.
  const keys = ['total', 'typed'];
  if (slug && type && isKnown(slug, type)) keys.push(`fighter:${slug}`, `type:${type}`);
  const [total, typed, fighter, typeCount] = await readCounts(env.DB, keys);
  return json(
    { enabled: true, total, typed, fighter: fighter || 0, type: typeCount || 0 },
    200,
    { 'Cache-Control': 'public, max-age=60' },
  );
}

// POST /api/tally {slug, type, token}: count one finished quiz.
export async function handlePost({ env, request, isKnown, fetchImpl = fetch, today }) {
  if (!enabled(env)) return json({ enabled: false }, 503);
  const parsed = await readJsonCapped(request);
  if (parsed.tooLarge) return json({ error: 'too large' }, 413);
  if (parsed.bad) return json({ error: 'bad json' }, 400);
  const body = parsed.value;
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

  const day = await bumpDay(env.DB, `day:${today}`, DAILY_CAP);
  if (day == null) return json({ error: 'daily cap' }, 429);

  const [total, typed, fighter, typeCount] = await env.DB.batch([
    bump(env.DB, 'total'),
    bump(env.DB, 'typed'),
    bump(env.DB, `fighter:${slug}`),
    bump(env.DB, `type:${type}`),
  ]);
  const n = (r) => r?.results?.[0]?.n || 0;
  return json({ enabled: true, total: n(total), typed: n(typed), fighter: n(fighter), type: n(typeCount) });
}
