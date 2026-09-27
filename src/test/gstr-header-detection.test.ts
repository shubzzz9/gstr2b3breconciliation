import { describe, expect, it } from 'vitest';
import XLSX from 'xlsx-js-style';
import { scanGSTR2B } from '@/lib/gst-parsers';

const workbook = (rows: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'B2B');
  return wb;
};

describe('GSTR-2B header detection', () => {
  it('does not use the first transaction as headers', () => {
    const wb = workbook([
      ['GSTIN', 'Supplier', 'Invoice No', 'Date', 'Taxable Amount', 'IGST'],
      ['27 AAACV 0141N 1ZC', 'Vendor One', 'INV-001', '01/04/2026', 1000, 180],
      ['29ABCDE1234F1Z5', 'Vendor Two', 'INV-002', '02/04/2026', 2000, 360],
    ]);
    const scan = scanGSTR2B(wb, 'B2B');
    expect(scan.hdrIdx).toBe(0);
    expect(scan.dataStartIdx).toBe(1);
    expect(scan.allHeaders).toContain('GSTIN');
    expect(scan.allHeaders).not.toContain('27 AAACV 0141N 1ZC');
  });

  it('handles merged multi-row portal headers', () => {
    const wb = workbook([
      ['GST Portal export'],
      ['GSTIN of supplier', 'Trade name', 'Invoice details', null, 'Tax details', null],
      [null, null, 'Invoice number', 'Invoice date', 'Taxable value', 'Integrated tax'],
      ['27AAACV0141N1ZC', 'Vendor One', 'INV-001', '01/04/2026', 1000, 180],
    ]);
    const scan = scanGSTR2B(wb, 'B2B');
    expect(scan.hdrIdx).toBe(1);
    expect(scan.dataStartIdx).toBe(3);
    expect(scan.detected['GSTIN of supplier']).toBe('GSTIN of supplier');
    expect(scan.detected['Invoice number']).toBe('Invoice number');
  });

  it('finds a custom one-row header above transaction rows', () => {
    const wb = workbook([
      ['Report generated for April'],
      [],
      ['GST No', 'Party', 'Bill Ref', 'Dt', 'Assessable Amt', 'CGST', 'SGST'],
      ['27AAACV0141N1ZC', 'Vendor One', 'A-100', '01-04-2026', '1,000.00', '90.00', '90.00'],
      ['29ABCDE1234F1Z5', 'Vendor Two', 'A-101', '02-04-2026', '2,000.00', '180.00', '180.00'],
    ]);
    const scan = scanGSTR2B(wb, 'B2B');
    expect(scan.hdrIdx).toBe(2);
    expect(scan.dataStartIdx).toBe(3);
    expect(scan.allHeaders).toContain('Bill Ref');
  });
});