import { statusOf } from './status.js';

// Draws a 1080x1350 result card in the browser (Canvas, no library) so the
// person's name can appear on an image without any server rendering.
const W = 1080;
const H = 1350;
const GOLD = '#d4af37';
const RED = '#dc2626';

function fitFont(ctx, text, family, max, maxWidth) {
  let size = max;
  do {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 24);
  return size;
}

function spaced(ctx, text, x, y, spacing, align = 'left') {
  const chars = [...text];
  const width = chars.reduce((w, c) => w + ctx.measureText(c).width + spacing, -spacing);
  let cx = align === 'center' ? x - width / 2 : x;
  const previous = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = previous;
}

export async function drawResultCard({ fighter, name, matchPct }, type) {
  await Promise.all([
    document.fonts.load('120px "Bebas Neue"'),
    document.fonts.load('500 40px "Oswald"'),
  ]).catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const BEBAS = '"Bebas Neue", Impact, sans-serif';
  const OSWALD = 'Oswald, "Arial Narrow", sans-serif';

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(150, 120, 0, 150, 120, 900);
  g.addColorStop(0, 'rgba(220,38,38,0.35)');
  g.addColorStop(1, 'rgba(220,38,38,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W - 80, H - 80, 0, W - 80, H - 80, 800);
  g.addColorStop(0, 'rgba(212,175,55,0.25)');
  g.addColorStop(1, 'rgba(212,175,55,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 14);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = GOLD;
  ctx.font = `500 34px ${OSWALD}`;
  const kicker = (name ? `${name} fights like` : 'I fight like').toUpperCase();
  spaced(ctx, kicker, W / 2, 190, 6, 'center');

  ctx.textAlign = 'center';
  if (fighter.nickname) {
    ctx.fillStyle = GOLD;
    fitFont(ctx, `"${fighter.nickname.toUpperCase()}"`, BEBAS, 64, W - 160);
    ctx.fillText(`"${fighter.nickname.toUpperCase()}"`, W / 2, 300);
  }
  ctx.fillStyle = '#fff';
  const big = fighter.name.toUpperCase();
  fitFont(ctx, big, BEBAS, 170, W - 120);
  ctx.fillText(big, W / 2, 460);

  ctx.fillStyle = '#bdbdbd';
  ctx.font = `500 34px ${OSWALD}`;
  const meta = [fighter.division, fighter.record, statusOf(fighter)?.label].filter(Boolean).join('  ·  ');
  ctx.fillText(meta.toUpperCase(), W / 2, 530);

  // Type badge
  ctx.font = `60px ${BEBAS}`;
  const badge = type.name.toUpperCase();
  const bw = ctx.measureText(badge).width + 70;
  ctx.fillStyle = RED;
  ctx.fillRect((W - bw) / 2, 600, bw, 92);
  ctx.fillStyle = '#fff';
  ctx.fillText(badge, W / 2, 668);

  ctx.fillStyle = '#e5e5e5';
  ctx.font = `500 38px ${OSWALD}`;
  ctx.fillText(type.tagline, W / 2, 760);

  if (matchPct != null) {
    ctx.fillStyle = GOLD;
    ctx.font = `150px ${BEBAS}`;
    ctx.fillText(`${matchPct}%`, W / 2, 950);
    ctx.fillStyle = '#9a9a9a';
    ctx.font = `500 30px ${OSWALD}`;
    spaced(ctx, 'STYLE MATCH', W / 2, 1000, 6, 'center');
  }

  const stats = [
    ['STRIKES/MIN', fighter.slpm.toFixed(2)],
    ['TAKEDOWNS/15', fighter.tdAvg.toFixed(2)],
    ['UFC FINISHES', String(fighter.koWins + fighter.subWins)],
  ];
  const sw = 290;
  const sx = (W - sw * 3 - 30 * 2) / 2;
  stats.forEach(([label, value], i) => {
    const x = sx + i * (sw + 30);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, 1060, sw, 130);
    ctx.fillStyle = GOLD;
    ctx.fillRect(x, 1060, sw, 4);
    ctx.fillStyle = '#fff';
    ctx.font = `64px ${BEBAS}`;
    ctx.fillText(value, x + sw / 2, 1135);
    ctx.fillStyle = '#9a9a9a';
    ctx.font = `500 22px ${OSWALD}`;
    ctx.fillText(label, x + sw / 2, 1172);
  });

  ctx.fillStyle = GOLD;
  ctx.font = `52px ${BEBAS}`;
  ctx.fillText('UFC.ARISTOTLE.ME', W / 2, 1290);

  return canvas;
}

// Shares the image on phones that support file sharing, otherwise downloads it.
// Returns how it was delivered, for analytics.
export async function saveResultImage(result, type) {
  const canvas = await drawResultCard(result, type);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const filename = `ufc-${result.fighter.slug}.png`;
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch {
      /* dismissed: fall through to download */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}
