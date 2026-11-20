// /api/tally: the quiz counter. Logic and guardrails live in src/lib/tally-core.js.
// Needs a D1 binding `DB` (schema in migrations/) and the secret
// `TURNSTILE_SECRET`; without them it answers {enabled:false} and the app
// simply hides the counter.
import roster from '../../src/data/roster.json';
import { canonicalGetUrl, handleGet, handlePost } from '../../src/lib/tally-core.js';

const typeOf = new Map(roster.fighters.map((f) => [f.slug, f.type]));
const isKnown = (slug, type) => typeOf.get(slug) === type;

export async function onRequestGet({ request, env, waitUntil }) {
  const url = canonicalGetUrl(new URL(request.url), isKnown);
  const key = new Request(url.toString());
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await handleGet({ env, url, isKnown });
  if (res.headers.get('Cache-Control')?.includes('max-age=60')) waitUntil(cache.put(key, res.clone()));
  return res;
}

export function onRequestPost({ request, env }) {
  return handlePost({ env, request, isKnown, today: new Date().toISOString().slice(0, 10) });
}
