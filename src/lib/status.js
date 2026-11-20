import { FAME_LADDER } from '../data/stars.js';

const BOTTOM_LEVEL = FAME_LADDER[FAME_LADDER.length - 1].level;

// A short status for a fighter: who they are today. Shared by the result
// page, the Save image card and the preview images.
export function statusOf(f) {
  if (f.champion) return { label: 'Champion', className: 'champ' };
  if (f.legend && f.tier !== BOTTOM_LEVEL) return { label: 'Legend', className: 'legend' };
  if (f.legend) return { label: `Last fought ${f.lastFight.slice(0, 4)}`, className: 'past' };
  return null;
}
