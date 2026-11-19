// Share URL format (PRD decision 6): /r/<slug>?a=<answers>
import { QUESTIONS } from './questions.js';

export const SITE_URL = 'https://ufc.aristotle.me';

export function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

export function sharePath({ slug, answers }) {
  return `/r/${encodeURIComponent(slug)}${answers ? `?a=${answers.join('')}` : ''}`;
}

export function shareUrl(parts) {
  return SITE_URL + sharePath(parts);
}

// Returns { slug, answers, legacy } for /r/<slug> URLs and for the old
// /?result=<slug>&from=<name> links (the name is ignored), or null.
export function parseShareLocation(pathname, search) {
  const params = new URLSearchParams(search);
  const m = /^\/r\/([^/]+)\/?$/.exec(pathname);
  let slug = null;
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
  }
  if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return {
    slug,
    answers: parseAnswers(params.get('a')),
    legacy: !m,
  };
}
