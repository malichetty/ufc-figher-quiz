// Renders one 1200x630 share-preview PNG per roster fighter into dist/og/.
// Runs once per build (PRD decision 7): nothing is ever rendered on request.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { TYPES } from '../src/lib/types.js';
import { statusOf } from '../src/lib/status.js';

const root = new URL('..', import.meta.url);
const OUT = new URL('dist/og/', root);
const roster = JSON.parse(await readFile(new URL('src/data/roster.json', root), 'utf8'));
const fonts = [
  { name: 'Bebas', data: await readFile(new URL('assets/fonts/BebasNeue-Regular.ttf', root)), weight: 400 },
  { name: 'Oswald', data: await readFile(new URL('assets/fonts/Oswald-Medium.ttf', root)), weight: 500 },
];

const GOLD = '#d4af37';
const RED = '#dc2626';

const h = (type, style, ...children) => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.flat().filter((c) => c !== null) },
});

const nameSize = (name) => (name.length > 22 ? 92 : name.length > 16 ? 112 : 136);

function stat(label, value) {
  return h(
    'div',
    {
      flexDirection: 'column',
      background: 'rgba(255,255,255,0.05)',
      borderTop: `3px solid ${GOLD}`,
      padding: '14px 22px',
      width: 230,
    },
    h('div', { fontFamily: 'Bebas', fontSize: 52, color: '#fff', lineHeight: 1 }, String(value)),
    h('div', { fontFamily: 'Oswald', fontSize: 20, color: '#9a9a9a', letterSpacing: 3 }, label),
  );
}

function card(f) {
  const type = TYPES[f.type];
  const meta = [f.division, f.record, statusOf(f)?.label].filter(Boolean).join('  ·  ').toUpperCase();
  return h(
    'div',
    {
      width: 1200,
      height: 630,
      flexDirection: 'column',
      background: '#0a0a0a',
      backgroundImage:
        'radial-gradient(circle at 15% 10%, rgba(220,38,38,0.28), transparent 55%), radial-gradient(circle at 90% 95%, rgba(212,175,55,0.22), transparent 50%)',
      color: '#fff',
    },
    h('div', { height: 10, width: 1200, background: GOLD }),
    h(
      'div',
      { flexDirection: 'column', padding: '40px 64px 0', flexGrow: 1 },
      h(
        'div',
        { alignItems: 'center', justifyContent: 'space-between' },
        h('div', { fontFamily: 'Oswald', fontSize: 26, color: GOLD, letterSpacing: 6 }, 'WHICH UFC FIGHTER ARE YOU?'),
        h(
          'div',
          { background: RED, padding: '6px 18px', fontFamily: 'Bebas', fontSize: 34, letterSpacing: 2 },
          type.name.toUpperCase(),
        ),
      ),
      h(
        'div',
        { flexDirection: 'column', marginTop: 26 },
        f.nickname
          ? h('div', { fontFamily: 'Bebas', fontSize: 46, color: GOLD, letterSpacing: 2 }, `"${f.nickname.toUpperCase()}"`)
          : null,
        h('div', { fontFamily: 'Bebas', fontSize: nameSize(f.name), lineHeight: 0.95 }, f.name.toUpperCase()),
        h('div', { fontFamily: 'Oswald', fontSize: 26, color: '#bdbdbd', letterSpacing: 3, marginTop: 10 }, meta),
        h('div', { fontFamily: 'Oswald', fontSize: 30, color: '#e5e5e5', marginTop: 22 }, type.tagline),
      ),
      h(
        'div',
        { marginTop: 'auto', marginBottom: 34, gap: 18, alignItems: 'flex-end' },
        stat('STRIKES / MIN', f.slpm.toFixed(2)),
        stat('TAKEDOWNS / 15', f.tdAvg.toFixed(2)),
        stat('UFC FINISHES', f.koWins + f.subWins),
        h(
          'div',
          { flexDirection: 'column', alignItems: 'flex-end', marginLeft: 'auto' },
          h('div', { fontFamily: 'Oswald', fontSize: 22, color: '#9a9a9a', letterSpacing: 3 }, 'WHO DO YOU FIGHT LIKE?'),
          h('div', { fontFamily: 'Bebas', fontSize: 44, color: GOLD, letterSpacing: 2 }, 'UFC.ARISTOTLE.ME'),
        ),
      ),
    ),
  );
}

async function render(node) {
  const svg = await satori(node, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

await mkdir(OUT, { recursive: true });
const started = Date.now();
for (const f of roster.fighters) {
  await writeFile(new URL(`${f.slug}.png`, OUT), await render(card(f)));
}
console.log(`[og] ${roster.fighters.length} preview images in ${((Date.now() - started) / 1000).toFixed(1)}s`);
