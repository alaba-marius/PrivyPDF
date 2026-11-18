import { readFileSync } from 'node:fs';

// WCAG contrast audit for the design system tokens in css/theme.css.
// Reads the token file directly (no dependencies), resolves rgb/a tokens,
// composites rgba backgrounds over their backdrop, and checks each required
// text/background pair against the 4.5:1 threshold (WCAG AA, normal text).
// Exits 1 when any pair fails.

const css = readFileSync(new URL('../css/theme.css', import.meta.url), 'utf8');

const tokens = {};
for (const m of css.matchAll(/^\s*--color-([\w-]+)\s*:\s*([^;]*?);/gm)) {
  tokens[m[1]] = m[2].trim();
}

const REQUIRED_TOKENS = [
  'paper-white',
  'absolute-ink',
  'graphite',
  'soft-charcoal',
  'studio-black',
  'electric-capture-blue',
  'surface-muted',
  'on-dark',
  'on-dark-muted',
  'on-dark-faint',
  'danger-on-dark',
  'danger',
];

for (const name of REQUIRED_TOKENS) {
  if (!(name in tokens)) {
    throw new Error(`Missing design token in css/theme.css: --color-${name}`);
  }
}

function parseColor(spec) {
  let s = String(spec).trim();
  if (s.startsWith('--color-')) {
    s = tokens[s.slice('--color-'.length)].trim();
  } else if (s.startsWith('--')) {
    s = tokens[s.slice(2)].trim();
  }
  let m;
  if ((m = s.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)$/i))) {
    return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
  }
  if ((m = s.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i))) {
    return { r: +m[1], g: +m[2], b: +m[3], a: 1 };
  }
  if ((m = s.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/))) {
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 1 };
  }
  if ((m = s.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/))) {
    return {
      r: parseInt(m[1] + m[1], 16),
      g: parseInt(m[2] + m[2], 16),
      b: parseInt(m[3] + m[3], 16),
      a: 1,
    };
  }
  throw new Error(`Cannot parse color: ${spec}`);
}

function compositeOver(fg, bg) {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function resolve(spec, over) {
  let color;
  if (Array.isArray(spec)) {
    // A background given as [surfaceToken, backdropToken]: composite the
    // rgba surface over its backdrop before contrasting.
    color = compositeOver(parseColor(spec[0]), parseColor(spec[1]));
    return color;
  }
  color = parseColor(spec);
  if (over) {
    const backdrop = Array.isArray(over) ? resolve(over[0], over[1]) : parseColor(over);
    color = compositeOver(color, backdrop);
  }
  return color;
}

function linear(c) {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(c) {
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#ffffff';
const THRESHOLD = 4.5;

// [name, foreground, background]. Background may be [token, backdrop] to
// composite an rgba surface over another color before contrasting.
const PAIRS = [
  ['Absolute Ink on white', '--color-absolute-ink', WHITE],
  ['Graphite on white', '--color-graphite', WHITE],
  ['Soft Charcoal on white', '--color-soft-charcoal', WHITE],
  [
    'Soft Charcoal on surface-muted over white',
    '--color-soft-charcoal',
    ['--color-surface-muted', WHITE],
  ],
  ['white on Electric Capture Blue', WHITE, '--color-electric-capture-blue'],
  ['Electric Capture Blue on white', '--color-electric-capture-blue', WHITE],
  ['white on Studio Black', WHITE, '--color-studio-black'],
  ['--color-on-dark on Studio Black', '--color-on-dark', '--color-studio-black'],
  [
    '--color-on-dark-muted on Studio Black',
    '--color-on-dark-muted',
    '--color-studio-black',
  ],
  [
    '--color-on-dark-faint on Studio Black',
    '--color-on-dark-faint',
    '--color-studio-black',
  ],
  [
    '--color-danger-on-dark on Studio Black',
    '--color-danger-on-dark',
    '--color-studio-black',
  ],
  ['--color-danger on white', '--color-danger', WHITE],
];

let failures = 0;
const rows = PAIRS.map(([name, fg, bg]) => {
  const foreground = resolve(fg);
  const background = resolve(bg);
  const ratio = contrast(foreground, background);
  const ok = ratio >= THRESHOLD;
  if (!ok) failures += 1;
  return {
    name,
    fg: `rgb(${Math.round(foreground.r)}, ${Math.round(foreground.g)}, ${Math.round(foreground.b)})`,
    bg: Array.isArray(bg)
      ? `${bg[0]} over ${bg[1]}`
      : bg.startsWith('#')
        ? bg
        : `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`,
    ratio: ratio.toFixed(2),
    ok,
  };
});

const NAME_W = 42;
const FG_W = 40;
const BG_W = 26;
const pad = (s, w) => (s + ' '.repeat(w)).slice(0, w);

console.log(`Design token contrast check (WCAG AA, ${THRESHOLD}:1, normal text)`);
console.log('='.repeat(NAME_W + FG_W + BG_W + 14));
console.log(
  pad('Pair', NAME_W) +
    pad('Foreground', FG_W) +
    pad('Background', BG_W) +
    'Ratio  Status'
);
console.log('-'.repeat(NAME_W + FG_W + BG_W + 14));

for (const row of rows) {
  console.log(
    pad(row.name, NAME_W) +
      pad(row.fg, FG_W) +
      pad(row.bg, BG_W) +
      `  ${pad(row.ratio, 6)}  ${row.ok ? 'PASS' : 'FAIL'}`
  );
}

console.log('-'.repeat(NAME_W + FG_W + BG_W + 14));
if (failures === 0) {
  console.log(`All ${rows.length} pairs PASS (>= ${THRESHOLD}:1)`);
  process.exit(0);
} else {
  console.log(`${failures} of ${rows.length} pairs FAIL (< ${THRESHOLD}:1)`);
  process.exit(1);
}
