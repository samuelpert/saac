import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '../src');
const TOKENS = path.join(SRC, 'styles/tokens.css');

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])));
  return files.flat();
}

function tokens(css: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) map.set(m[1]!, m[2]!);
  return map;
}

// WCAG 2 relative luminance and contrast ratio.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('design tokens', () => {
  it('no component or stylesheet holds a hex color; only tokens.css does', async () => {
    const offenders: string[] = [];
    for (const file of await walk(SRC)) {
      if (file === TOKENS || !/\.(tsx?|css)$/.test(file)) continue;
      const text = await readFile(file, 'utf8');
      for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        // Skip things that only look like colors, such as "#root".
        if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(m[0]) || /^#[0-9a-fA-F]{8}$/.test(m[0])) offenders.push(`${path.relative(SRC, file)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every contrast pair in design.md section 9 meets its target', async () => {
    const t = tokens(await readFile(TOKENS, 'utf8'));
    const get = (name: string) => {
      const v = t.get(name);
      if (!v) throw new Error(`missing token --${name}`);
      return v;
    };
    const pairs: [string, string, string, number][] = [
      ['Text on surface', 'color-text', 'color-surface', 4.5],
      ['Secondary text on surface', 'color-text-secondary', 'color-surface', 4.5],
      ['Secondary text on page', 'color-text-secondary', 'color-bg', 4.5],
      ['Muted text on surface', 'color-text-muted', 'color-surface', 4.5],
      ['Muted text on page', 'color-text-muted', 'color-bg', 4.5],
      ['White on primary button', 'color-on-primary', 'color-primary', 4.5],
      ['White on primary hover', 'color-on-primary', 'color-primary-hover', 4.5],
      ['Link on surface', 'color-link', 'color-surface', 4.5],
      ['FIU Gold on FIU Blue', 'color-brand-gold', 'color-brand-blue', 4.5],
      ['Accent text on surface', 'color-accent-text', 'color-surface', 4.5],
      ['Danger on its tint', 'color-danger', 'color-danger-bg', 4.5],
      ['Success on its tint', 'color-success', 'color-success-bg', 4.5],
      ['Warning on its tint', 'color-warning', 'color-warning-bg', 4.5],
      ['Info on its tint', 'color-info', 'color-info-bg', 4.5],
      ['Input border on surface', 'color-border-strong', 'color-surface', 3],
      ['Focus ring on surface', 'color-focus', 'color-surface', 3],
      ['Chart still out on white', 'chart-out', 'color-surface', 3],
      // Extra pairs the screens use.
      ['Sidebar muted on sidebar', 'color-sidebar-muted', 'color-sidebar', 4.5],
      ['Muted text on subtle chips', 'color-text-muted', 'color-surface-subtle', 4.5],
      ['Secondary text on subtle chips', 'color-text-secondary', 'color-surface-subtle', 4.5],
      ['Danger on the danger card', 'color-danger', 'color-danger-bg', 4.5],
    ];
    const failures = pairs
      .map(([label, fg, bg, target]) => ({ label, ratio: contrast(get(fg), get(bg)), target }))
      .filter((p) => p.ratio < p.target)
      .map((p) => `${p.label}: ${p.ratio.toFixed(2)} < ${p.target}`);
    expect(failures).toEqual([]);
  });
});
