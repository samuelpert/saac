import JsBarcode from 'jsbarcode';
import { download } from '../api/client';

/**
 * Barcodes are Code 128 of the item's saved identifier (a tech item's tag, a book copy's tag),
 * drawn on demand and never stored. Code 128 holds printable ASCII; anything else is refused
 * with a message instead of drawing a wrong barcode.
 */
export function barcodeProblem(code: string): string | null {
  if (code.trim() === '') return 'This item has no identifier to put in a barcode.';
  if (!/^[\x20-\x7E]+$/.test(code)) return `“${code}” has characters a barcode cannot hold. Edit the tag to use letters, digits, dots, dashes or slashes.`;
  return null;
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The barcode as an SVG element, with the identifier printed under the bars. */
export function barcodeSvg(code: string): SVGSVGElement {
  const problem = barcodeProblem(code);
  if (problem) throw new Error(problem);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  JsBarcode(svg, code, {
    format: 'CODE128',
    displayValue: true,
    font: 'Arial',
    fontSize: 16,
    height: 60,
    width: 2,
    margin: 10,
    lineColor: cssVar('--barcode-ink'),
    background: cssVar('--barcode-paper'),
  });
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Barcode ${code}`);
  return svg;
}

/** Save the barcode as an SVG file named after the identifier, so it prints crisp at any size. */
export function downloadBarcode(code: string) {
  const text = new XMLSerializer().serializeToString(barcodeSvg(code));
  download(new Blob([text], { type: 'image/svg+xml' }), `${code.replace(/[^A-Za-z0-9._-]/g, '_')}.svg`);
}

/** Print one barcode, or a sheet of them, from a hidden frame so the page itself is not printed. */
export function printBarcodes(codes: string[]) {
  const svgs = codes.map((c) => new XMLSerializer().serializeToString(barcodeSvg(c)));
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>Barcodes</title><style>
      @page { margin: 0.4in; }
      body { margin: 0; background: ${cssVar('--barcode-paper')}; }
      .sheet { display: flex; flex-wrap: wrap; gap: 0.25in; }
      .label { break-inside: avoid; }
      .label svg { display: block; max-width: 3in; height: auto; }
    </style></head><body><div class="sheet">${svgs.map((s) => `<div class="label">${s}</div>`).join('')}</div></body></html>`,
  );
  doc.close();
  const win = frame.contentWindow!;
  win.addEventListener('afterprint', () => frame.remove());
  win.focus();
  win.print();
  // Some browsers never fire afterprint; clean up anyway.
  setTimeout(() => frame.remove(), 60_000);
}
