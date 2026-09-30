import { it, expect } from 'vitest';
import XLSX from 'xlsx-js-style';
import fs from 'fs';
import { scanTally, processTally, scanGSTR2B, parseGSTR2BWithStats } from '@/lib/gst-parsers';
import { reconcile, buildGSTR3BSummary } from '@/lib/gst-reconcile';
const P = '/mnt/user-uploads/';
it.skipIf(!fs.existsSync(P + 'Total_ITC_March.xlsx'))('march', () => {
  const twb = XLSX.read(fs.readFileSync(P + 'Total_ITC_March.xlsx'));
  const ts: any = (scanTally as any)(twb);
  const m: any = { hdrIdx: ts.hdrIdx, headers: ts.headers, raw: ts.raw, ...ts.singleGuesses, ...ts.multiGuesses };
  const t: any = processTally(m);
  const gwb = XLSX.read(fs.readFileSync(P + 'GSTR2B-TaxPower_122347.xlsx'));
  const gs: any = (scanGSTR2B as any)(gwb);
  const g = parseGSTR2BWithStats(gs).rows;
  const reco = reconcile(g, t.rows, gs.extraCols);
  const c: any = {}; reco.forEach((r: any) => { const k = r.Remarks || r['Remarks']; c[k] = (c[k] || 0) + 1; });
  console.log(JSON.stringify({ totals: t.audit.totals, split: t.audit.splitRateBills?.length, counts: c, g3b: buildGSTR3BSummary(reco).slice(0, 8) }));
  expect(t.audit.totals.cgst).toBeGreaterThan(0);
});
