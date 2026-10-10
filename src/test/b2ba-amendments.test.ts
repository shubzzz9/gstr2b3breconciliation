/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx-js-style';
import fs from 'fs';
import { mergeGSTR2BAmendments, classifyGSTR2BSheets, scanGSTR2B, parseGSTR2B } from '@/lib/gst-parsers';
import { reconcile } from '@/lib/gst-reconcile';

const HDR = ['Sr.No', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type', 'Reverse Charge', 'Original Invoice No', 'Original Invoice Date', 'Revised Invoice No', 'Revised Invoice Date', 'Invoice Value', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess'];
const B2B_HDR = ['GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice type', 'Invoice Date', 'Invoice Value', 'Place of supply', 'Reverse Charge', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'];
const G = '27DAMPP1036E1ZR';

const wb = () => {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([B2B_HDR,
    [G, 'GENIOUS', 'OLD-1', 'Regular', '01/03/2026', 1180, '27', 'No', 1000, 0, 90, 90, 0],
    ['27AAACV0141N1ZC', 'OTHER', 'X-9', 'Regular', '02/03/2026', 118, '27', 'No', 100, 0, 9, 9, 0]]), 'B2B');
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([['Amendments to previously filed invoices by supplier'], HDR,
    [1, 'GENIOUS', G, '27', 'Regular', 'No', 'OLD-1', '01/03/2026', 'NEW-1', '05/03/2026', 2360, 2000, 0, 180, 180, 0]]), 'B2BA');
  return w;
};

describe('B2BA amendments', () => {
  it('classifies the amendment sheet', () => {
    expect(classifyGSTR2BSheets(wb()).amendmentSheets).toContain('B2BA');
  });
  it('uses revised number/values, links to original, supersedes the B2B row', () => {
    const w = wb();
    const base = parseGSTR2B(scanGSTR2B(w, 'B2B'));
    const m = mergeGSTR2BAmendments(w, 'B2BA', base);
    expect(m.skipped).toBe(false);
    expect(m.superseded).toHaveLength(1);
    expect(m.rows).toHaveLength(2);
    const a = m.rows.find((r: any) => r._amended);
    expect(a['Invoice number']).toBe('NEW-1');
    expect(Number(a['Taxable Value (₹)'])).toBe(2000);
    expect(a['Invoice type']).toContain('revised from OLD-1');
  });
  it('matches books that still carry the original number', () => {
    const w = wb();
    const m = mergeGSTR2BAmendments(w, 'B2BA', parseGSTR2B(scanGSTR2B(w, 'B2B')));
    const ours = [{ gstin: G, tradeName: 'Genious', invoiceNum: 'OLD-1', invoiceDate: '01/03/2026', taxable: 2000, igst: 0, cgst: 180, sgst: 180, cess: 0 }];
    const out = reconcile(m.rows, ours);
    expect(out.filter((r: any) => r['Remarks'] === 'Matched')).toHaveLength(2);
  });
  const P = '/mnt/user-uploads/GSTR2B-TaxPower_122347.xlsx';
  it.skipIf(!fs.existsSync(P))('reads the March B2BA sheet', () => {
    const w = XLSX.read(fs.readFileSync(P));
    const map = classifyGSTR2BSheets(w);
    const base = parseGSTR2B(scanGSTR2B(w, map.b2bSheet!));
    const m = mergeGSTR2BAmendments(w, map.amendmentSheets.find(s => !/cdnr/i.test(s))!, base);
    console.log('MARCH_B2BA', m.amended.length, m.superseded.length, m.amended.slice(0, 3).map((r: any) => [r['Trade/Legal name'], r['Invoice number'], r['Invoice type']]));
    expect(m.amended.length).toBeGreaterThan(0);
  });
});
