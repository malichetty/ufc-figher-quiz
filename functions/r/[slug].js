// Cloudflare Pages Function for /r/<slug> share links (PRD FR-7).
// Serves the app's index.html with the link-preview tags filled in for this
// fighter and the sharer's name. No image rendering, no storage, no API calls.
import roster from '../../src/data/roster.json';
import { TYPES } from '../../src/lib/types.js';
import { sanitizeName, SITE_URL } from '../../src/lib/share.js';

const bySlug = new Map(roster.fighters.map((f) => [f.slug, f]));

function previewFor(fighter, name, url, origin) {
  const type = TYPES[fighter.type];
  const title = `${name || 'I'} ${name ? 'fights' : 'fight'} like ${fighter.name}`;
  return {
    title: `${title} | Which UFC Fighter Are You?`,
    ogTitle: `${title} 🥊`,
    description: `${type.name}: ${type.tagline} Which UFC fighter are you? Six questions, no sign-up.`,
    image: `${origin}/og/${fighter.slug}.png`,
    url,
  };
}

class SetAttr {
  constructor(value) {
    this.value = value;
  }
  element(el) {
    el.setAttribute('content', this.value);
  }
}

export async function onRequestGet({ request, params, env }) {
  const page = await env.ASSETS.fetch(new URL('/', request.url));
  const slug = String(params.slug || '').toLowerCase();
  const fighter = bySlug.get(slug);
  if (!fighter || !page.ok) return page;

  const reqUrl = new URL(request.url);
  const name = sanitizeName(reqUrl.searchParams.get('n'));
  const canonical = new URL(`/r/${fighter.slug}`, SITE_URL);
  if (name) canonical.searchParams.set('n', name);
  // Image from the serving origin, so preview deployments show their own images.
  const p = previewFor(fighter, name, canonical.toString(), reqUrl.origin);

  const headers = new Headers(page.headers);
  headers.set('Cache-Control', 'public, max-age=300');
  return new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(p.title) })
    .on('meta[name="description"]', new SetAttr(p.description))
    .on('meta[property="og:title"]', new SetAttr(p.ogTitle))
    .on('meta[property="og:description"]', new SetAttr(p.description))
    .on('meta[property="og:url"]', new SetAttr(p.url))
    .on('meta[property="og:image"]', new SetAttr(p.image))
    .on('meta[name="twitter:title"]', new SetAttr(p.ogTitle))
    .on('meta[name="twitter:description"]', new SetAttr(p.description))
    .on('meta[name="twitter:url"]', new SetAttr(p.url))
    .on('meta[name="twitter:image"]', new SetAttr(p.image))
    .transform(new Response(page.body, { status: 200, headers }));
}
