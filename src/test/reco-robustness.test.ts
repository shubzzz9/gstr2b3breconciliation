/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { reconcile, reconcileNotes, repairBlankGSTIN, buildGSTR3BSummary } from '@/lib/gst-reconcile';
import { isValidGSTIN, hdrKey } from '@/lib/gst-helpers';

const g2b = (gstin: string, name: string, inv: string, taxable: number, cgst: number, date = '05/03/2026', docType?: string) => ({
  'GSTIN of supplier': gstin, 'Trade/Legal name': name, 'Invoice number': inv, 'Invoice Date': date,
  'Taxable Value (₹)': taxable, 'Integrated Tax(₹)': 0, 'Central Tax(₹)': cgst, 'State/UT Tax(₹)': cgst, 'Cess(₹)': 0, ...(docType ? { docType } : {}),
});
const book = (gstin: string, name: string, inv: string, taxable: number, cgst: number, date = '05/03/2026', docType?: string) => ({
  gstin, tradeName: name, invoiceNum: inv, invoiceDate: date, taxable, igst: 0, cgst, sgst: cgst, cess: 0, ...(docType ? { docType } : {}),
});
const remarks = (out: any[]) => out.map(r => String(r['Remarks']));

describe('helpers', () => {
  it('validates GSTIN format', () => {
    expect(isValidGSTIN('27AJLPR7764A1ZV')).toBe(true);
    expect(isValidGSTIN('27AJLPR77641ZV')).toBe(false);
    expect(isValidGSTIN('')).toBe(false);
  });
  it('header keys ignore spacing/punctuation', () => {
    expect(hdrKey('I GST')).toBe(hdrKey('igst'));
    expect(hdrKey('C.G.S.T')).toBe('cgst');
  });
});

describe('blank / invalid GSTIN repair', () => {
  it('repairs on a unique name + amount hit, even with a different bill no.', () => {
    const g = [g2b('27ABHPW9571A1ZA', 'MANKESHWAR TECHNICAL SERVICES', 'MTS/03/2026/277', 625000, 56250)];
    const o = [book('', 'Mankeshwar Technical Services', 'MTS/03/20226/277', 625000, 56250)];
    expect(repairBlankGSTIN(g, o)).toHaveLength(1);
    const out = reconcile(g, o);
    expect(remarks(out).every(r => r.startsWith('Matched — GSTIN missing/invalid'))).toBe(true);
  });
  it('does not repair when two 2B rows qualify (ambiguous)', () => {
    const g = [g2b('27AAAAA1111A1Z1', 'TARA INDUSTRIES', 'A1', 1000, 90), g2b('27AAAAA1111A1Z1', 'TARA INDUSTRIES', 'A2', 1000, 90)];
    const o = [book('', 'Tara Industries', 'X', 1000, 90)];
    expect(repairBlankGSTIN(g, o)).toHaveLength(0);
  });
  it('does not repair when names differ', () => {
    const g = [g2b('27AAAAA1111A1Z1', 'ALPHA STEEL', 'A1', 1000, 90)];
    const o = [book('', 'Beta Pumps', 'A1', 1000, 90)];
    expect(repairBlankGSTIN(g, o)).toHaveLength(0);
  });
  it('leaves valid GSTINs untouched', () => {
    const o = [book('27AAAAA1111A1Z1', 'X', 'A1', 1000, 90)];
    repairBlankGSTIN([g2b('27BBBBB2222B1Z2', 'X', 'A1', 1000, 90)], o);
    expect(o[0].gstin).toBe('27AAAAA1111A1Z1');
  });
});

describe('note matching', () => {
  const G = '27ABDFA2001M1ZT';
  it('pairs by GSTIN + tax amount when numbers differ (portal has supplier CN no.)', () => {
    const cd = [g2b(G, 'LAXMI', 'CN-51', -100000, -9000, '10/03/2026', 'credit_note')];
    const ours = [book(G, 'Laxmi', 'GST/492/2025-26', -100000, -9000.5, '08/03/2026', 'debit_note')];
    const out = reconcileNotes(cd, ours);
    expect(remarks(out)).toEqual(['Possible Match — matched by amount, verify note number', 'Possible Match — matched by amount, verify note number']);
  });
  it('respects the 60-day window', () => {
    const cd = [g2b(G, 'L', 'CN-1', -1000, -90, '01/01/2026', 'credit_note')];
    const ours = [book(G, 'L', 'DN-1', -1000, -90, '30/03/2026', 'debit_note')];
    expect(remarks(reconcileNotes(cd, ours))).toContain('Not in our data');
  });
  it('groups several debit notes into one credit note', () => {
    const cd = [g2b(G, 'SHREEJI', 'CN/023', -10000, -900, '20/03/2026', 'credit_note')];
    const ours = [book(G, 'S', 'ST/1', -3000, -270, '01/03/2026', 'debit_note'), book(G, 'S', 'ST/2', -7000, -630, '05/03/2026', 'debit_note'), book(G, 'S', 'ST/3', -500, -45, '06/03/2026', 'debit_note')];
    const r = remarks(reconcileNotes(cd, ours));
    expect(r.filter(x => x.includes('covers 2 debit notes'))).toHaveLength(3);
    expect(r).toContain('Not in GSTR 2B');
  });
  it('3B summary lists unmatched books notes separately', () => {
    const nr = reconcileNotes([], [book(G, 'S', 'DN', -100, -9, '01/03/2026', 'debit_note')]);
    expect(buildGSTR3BSummary([], nr).some((x: any) => x['GSTR-3B Table'] === 'Info (notes)')).toBe(true);
  });
});

describe('scale', () => {
  it('reconciles 5,000 invoices and 1,000 notes quickly', () => {
    const g: any[] = [], o: any[] = [], cd: any[] = [], on: any[] = [];
    for (let i = 0; i < 5000; i++) {
      const gst = `27AAAAA${String(1000 + (i % 400)).padStart(4, '0')}A1Z${i % 10}`;
      g.push(g2b(gst, `SUP ${i % 400}`, `INV${i}`, 1000 + i, 90));
      if (i % 7) o.push(book(gst, `Sup ${i % 400}`, i % 11 ? `INV${i}` : `inv-${i}`, 1000 + i, 90));
      if (i < 1000) { cd.push(g2b(gst, 'S', `CN${i}`, -(100 + i), -9, '05/03/2026', 'credit_note')); on.push(book(gst, 'S', `DN${i}`, -(100 + i), -9, '05/03/2026', 'debit_note')); }
    }
    o.push(book('', 'SUP 3', 'zzz', 1003, 90));
    const t = Date.now();
    repairBlankGSTIN(g, o);
    const out = reconcile(g, o);
    const nr = reconcileNotes(cd, on);
    expect(out.length).toBeGreaterThan(5000);
    expect(nr.length).toBe(2000);
    expect(Date.now() - t).toBeLessThan(15000);
  });
});
