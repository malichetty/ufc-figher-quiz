// Fetches the public fighter list and writes src/data/roster.json.
// Anonymous API limits: 500 rows per call, 30 calls/minute, 1,000/day per IP,
// so this pages by offset with a pause between calls. On any failure it keeps
// the committed roster.json, so a flaky API never breaks a deploy.
import { readFile, writeFile } from 'node:fs/promises';
import { buildRoster } from '../src/lib/roster.js';

const API = 'https://ufcapi.aristotle.me/api/fighters';
const PAGE = 500;
const MAX_PAGES = 20;
const TRIES = 3;
const OUT = new URL('../src/data/roster.json', import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPage(offset) {
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      const res = await fetch(`${API}?limit=${PAGE}&offset=${offset}`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === TRIES) throw err;
      await sleep(3000 * attempt);
    }
  }
}

async function fetchAll() {
  const rows = [];
  let total = Infinity;
  for (let page = 0; page < MAX_PAGES && rows.length < total; page++) {
    const body = await getPage(page * PAGE);
    total = body.total;
    if (!body.data?.length) break;
    rows.push(...body.data);
    await sleep(2100);
  }
  if (rows.length < total) throw new Error(`got ${rows.length} of ${total} fighters`);
  return rows;
}

async function main() {
  if (process.env.ROSTER_OFFLINE === '1') {
    console.log('[roster] ROSTER_OFFLINE=1, keeping committed roster.json');
    return;
  }
  let rows;
  try {
    rows = await fetchAll();
  } catch (err) {
    console.warn(`[roster] fetch failed (${err.message}); keeping committed roster.json`);
    return;
  }
  const { missingStars, ...roster } = buildRoster(rows);
  if (missingStars.length) console.warn(`[roster] stars not found in the API: ${missingStars.join(', ')}`);
  if (roster.fighters.length < 100) {
    console.warn(`[roster] only ${roster.fighters.length} fighters; keeping committed roster.json`);
    return;
  }
  const previous = await readFile(OUT, 'utf8').catch(() => '');
  const next = `${JSON.stringify({ ...roster, source: API }, null, 1)}\n`;
  if (previous === next) {
    console.log('[roster] unchanged');
    return;
  }
  await writeFile(OUT, next);
  console.log(
    `[roster] ${roster.fighters.length} fighters in pool, ${roster.activeCount} active, data through ${roster.snapshot}`,
  );
}

main();
