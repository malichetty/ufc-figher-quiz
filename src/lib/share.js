// Share URL format (PRD decision 6): /r/<slug>?n=<name>&a=<answers>&d=<division>
import { QUESTIONS } from './questions.js';

export const SITE_URL = 'https://ufc.aristotle.me';
export const NAME_MAX = 20;
const DIVISIONS = ['all', 'men', 'women'];

export function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sanitizeName(raw) {
  const clean = String(raw ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M} '.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Slice by code point so a two-unit letter is never cut in half.
  return Array.from(clean).slice(0, NAME_MAX).join('').trim();
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
    // The old app built slugs by only swapping spaces for hyphens, so they
    // can hold punctuation ("sean-o'malley", "khalil-rountree-jr.").
    slug = slugify(params.get('result'));
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
