// Share URL format (PRD decision 6): /r/<slug>?n=<name>&a=<answers>&d=<division>
import { QUESTIONS } from './questions.js';

export const SITE_URL = 'https://ufc.aristotle.me';
export const NAME_MAX = 20;
const DIVISIONS = ['all', 'men', 'women'];

export function sanitizeName(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M} '.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

export function parseAnswers(raw) {
  const s = String(raw ?? '');
  if (s.length !== QUESTIONS.length) return null;
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i) - 48;
    if (!(n >= 0 && n < QUESTIONS[i].options.length)) return null;
    out.push(n);
  }
  return out;
}

export function parseDivision(raw) {
  return DIVISIONS.includes(raw) ? raw : 'all';
}

export function sharePath({ slug, name, answers, division }) {
  const params = new URLSearchParams();
  const clean = sanitizeName(name);
  if (clean) params.set('n', clean);
  if (answers) params.set('a', answers.join(''));
  if (division && division !== 'all') params.set('d', division);
  const qs = params.toString();
  return `/r/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`;
}

export function shareUrl(parts) {
  return SITE_URL + sharePath(parts);
}

// Returns { slug, name, answers, division } for /r/<slug> URLs and for the old
// /?result=<slug>&from=<name> links, or null.
export function parseShareLocation(pathname, search) {
  const params = new URLSearchParams(search);
  const m = /^\/r\/([^/]+)\/?$/.exec(pathname);
  let slug = null;
  let name = params.get('n');
  if (m) {
    try {
      slug = decodeURIComponent(m[1]).toLowerCase();
    } catch {
      return null;
    }
  } else if (params.get('result')) {
    slug = params.get('result').toLowerCase();
    name = params.get('from');
  }
  if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return {
    slug,
    name: sanitizeName(name),
    answers: parseAnswers(params.get('a')),
    division: parseDivision(params.get('d')),
    legacy: !m,
  };
}
