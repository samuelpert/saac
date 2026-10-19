import { useEffect, useRef } from 'react';
import { Download, Printer } from 'lucide-react';
import { barcodeProblem, barcodeSvg, downloadBarcode, printBarcodes } from '../lib/barcode';
import { plural } from '../lib/format';

/** One item's barcode, drawn from its saved identifier, with Download and Print. */
export function BarcodeCard({ code }: { code: string }) {
  const box = useRef<HTMLDivElement>(null);
  const problem = barcodeProblem(code);
  useEffect(() => {
    if (problem || !box.current) return;
    box.current.replaceChildren(barcodeSvg(code));
  }, [code, problem]);
  if (problem) return <p className="small" role="alert">{problem}</p>;
  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <div ref={box} className="barcode" />
      <div className="row">
        <button type="button" className="btn" onClick={() => downloadBarcode(code)}>
          <Download size={16} aria-hidden="true" /> Download Barcode
        </button>
        <button type="button" className="btn" onClick={() => printBarcodes([code])}>
          <Printer size={16} aria-hidden="true" /> Print Barcode
        </button>
      </div>
    </div>
  );
}

/** For a batch just added: print every new barcode on one sheet. */
export function PrintAllBarcodes({ codes }: { codes: string[] }) {
  const bad = codes.map(barcodeProblem).find(Boolean);
  if (bad) return <p className="small" role="alert">{bad}</p>;
  return (
    <button type="button" className="btn" onClick={() => printBarcodes(codes)}>
      <Printer size={16} aria-hidden="true" /> Print all {plural(codes.length, 'barcode')}
    </button>
  );
}
