/* eslint-disable @typescript-eslint/no-explicit-any */
import XLSX from 'xlsx-js-style';
import { safeVal, safeNum, stamp, dateStringToSerial, GSTR_STD_COLS, numVal, AUDIT_FIELDS } from './gst-helpers';

const HDR_STYLE = {
  fill: { fgColor: { rgb: '1E3A5F' } },
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  alignment: { horizontal: 'center' as const, vertical: 'center' as const, wrapText: true },
};

const COL_WIDTHS: Record<string, number> = {
  'GSTIN': 17, 'Trade': 22, 'Supplier': 22, 'Invoice number': 17, 'Invoice No': 17,
  'Invoice Date': 14, 'Invoice type': 14, 'Invoice Value': 14, 'Place': 18,
  'Reverse': 14, 'Taxable': 14, 'Integrated': 12, 'Central': 12, 'State': 12,
  'Cess': 10, 'DATA': 10, 'Remarks': 38, 'Diagnosis': 52,
};

function getColWidth(name: string): number {
  for (const [k, w] of Object.entries(COL_WIDTHS)) { if (name.includes(k)) return w; }
  return 16;
}

function makeStyledSheet(rows: any[], colOrder?: string[]) {
  if (!rows || !rows.length) return XLSX.utils.aoa_to_sheet([colOrder || ['(No data)']]);
  const keys = colOrder || Object.keys(rows[0]);
  const dateColIndices = keys.reduce((a: number[], k, i) => { if (k.toLowerCase().includes('date')) a.push(i); return a; }, []);
  const aoa = [keys, ...rows.map(r => keys.map((k, ki) => {
    if (dateColIndices.includes(ki)) return '';
    const v = r[k]; return v === null || v === undefined ? '' : v;
  }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = keys.map(n => ({ wch: getColWidth(n) }));
  keys.forEach((name, ci) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (ws[addr]) ws[addr].s = HDR_STYLE; else ws[addr] = { t: 's', v: name, s: HDR_STYLE };
  });
  // Date cells
  rows.forEach((row, ri) => {
    dateColIndices.forEach(ci => {
      const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      const val = row[keys[ci]];
      const serial = dateStringToSerial(val);
      ws[addr] = serial !== null ? { t: 'n', v: serial, z: 'dd/mm/yyyy' } : { t: 's', v: String(val || '') };
    });
  });
  return ws;
}

export function downloadFile1(tallyData: any[]) {
  if (!tallyData) return;
  const cols = ['GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice Date',
    'Sum of Taxable Value (₹)', 'Sum of Integrated Tax(₹)', 'Sum of Central Tax(₹)', 'Sum of State/UT Tax(₹)'];
  const rows = tallyData.map(r => ({
    'GSTIN of supplier': safeVal(r.gstin), 'Trade/Legal name': safeVal(r.tradeName),
    'Invoice number': safeVal(r.invoiceNum), 'Invoice Date': safeVal(r.invoiceDate),
    'Sum of Taxable Value (₹)': r.taxable, 'Sum of Integrated Tax(₹)': r.igst,
    'Sum of Central Tax(₹)': r.cgst, 'Sum of State/UT Tax(₹)': r.sgst,
  }));
  const ws = makeStyledSheet(rows, cols);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GSTR-2B Format');
  XLSX.writeFile(wb, 'Tally_GSTR2B_Format_' + stamp() + '.xlsx');
}

export function downloadFile2(recoRows: any[], extraCols: any[] = []) {
  if (!recoRows) return;
  const cols = [...GSTR_STD_COLS, ...extraCols.filter(e => e.include).map(e => e.gstrCol), 'DATA', 'Remarks'];
  const ws = makeStyledSheet(recoRows, cols);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation_Output');
  XLSX.writeFile(wb, 'GST_Reconciliation_' + stamp() + '.xlsx');
}

export function downloadFile3(diagData: any) {
  if (!diagData) return;
  const wb = XLSX.utils.book_new();
  const cols1 = ['GSTIN (GSTR-2B)', 'Supplier', 'Invoice Number', 'Invoice Date', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Diagnosis'];
  const ws1 = makeStyledSheet(diagData.notInOurData.length ? diagData.notInOurData : [{ 'GSTIN (GSTR-2B)': 'No unmatched rows' }], cols1);
  XLSX.utils.book_append_sheet(wb, ws1, 'Not In Our Data');

  const cols2 = ['GSTIN (Tally)', 'Supplier', 'Invoice Number', 'Invoice Date', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Diagnosis'];
  const ws2 = makeStyledSheet(diagData.notInGSTR2B.length ? diagData.notInGSTR2B : [{ 'GSTIN (Tally)': 'No unmatched rows' }], cols2);
  XLSX.utils.book_append_sheet(wb, ws2, 'Not In GSTR 2B');

  if (diagData.figNotMatched?.length) {
    const cols3 = ['GSTIN', 'Supplier', 'Invoice Number', 'DATA Source', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Diagnosis'];
    XLSX.utils.book_append_sheet(wb, makeStyledSheet(diagData.figNotMatched, cols3), 'Fig Not Matched');
  }
  if (diagData.gstinMismatches?.length) {
    const cols4 = ['Invoice Number', 'GSTR-2B GSTIN', 'Our Data GSTIN', 'GSTR-2B Supplier', 'Our Data Supplier', 'Diagnosis'];
    XLSX.utils.book_append_sheet(wb, makeStyledSheet(diagData.gstinMismatches, cols4), 'GSTIN Mismatches');
  }
  XLSX.writeFile(wb, 'Mismatch_Diagnosis_' + stamp() + '.xlsx');
}

export function downloadPRTallyAudit(auditResult: any) {
  const wb = XLSX.utils.book_new();
  const { prRows, tallyRows } = auditResult;
  
  // Summary sheet
  const summaryRows = [
    { 'Metric': 'Total Bills in Client Sheet', 'Count': prRows.length },
    { 'Metric': 'Matched', 'Count': prRows.filter((r: any) => r.status === 'MATCHED').length },
    { 'Metric': 'Mismatched Figures', 'Count': prRows.filter((r: any) => r.status === 'MISMATCH').length },
    { 'Metric': 'Missing in Tally', 'Count': prRows.filter((r: any) => r.status === 'MISSING_IN_TALLY').length },
    { 'Metric': 'Extra in Tally (not in client sheet)', 'Count': tallyRows.filter((r: any) => r.status === 'NOT_IN_PR').length },
  ];
  XLSX.utils.book_append_sheet(wb, makeStyledSheet(summaryRows, ['Metric', 'Count']), 'Summary');

  // Mismatch details
  const mismatchRows: any[] = [];
  prRows.filter((r: any) => r.status === 'MISMATCH').forEach((r: any) => {
    AUDIT_FIELDS.forEach(f => {
      const d = r.diffs[f.label];
      if (d && Math.abs(d.diff) > 5) {
        mismatchRows.push({
          'Invoice': r.pr.rawBill, 'Party': r.pr.party,
          'Tax Head': f.label,
          'Client Sheet': d.pr, 'Tally': d.tally, 'Difference': d.diff,
        });
      }
    });
  });
  if (mismatchRows.length) {
    XLSX.utils.book_append_sheet(wb, makeStyledSheet(mismatchRows), 'Mismatch Detail');
  }

  XLSX.writeFile(wb, 'PR_vs_Tally_Audit_' + stamp() + '.xlsx');
}
